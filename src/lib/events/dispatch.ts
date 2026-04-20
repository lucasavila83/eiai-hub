/**
 * Outbound webhook dispatcher.
 *
 * Given an org + event + payload + optional filter context, looks up matching
 * `integrations` rows and POSTs the payload to each target URL in parallel.
 * Every attempt is logged to `webhook_deliveries`.
 *
 * Integrations currently supported: webhook, slack.
 * (email_notify, github — TODO)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventType =
  | "card.created"
  | "card.updated"
  | "card.moved"
  | "card.completed"
  | "card.overdue"
  | "card.deleted"
  | "card.assigned"
  | "card.unassigned"
  | "card.comment_added"
  | "bpm_card.created"
  | "bpm_card.moved"
  | "bpm_card.completed"
  | "bpm_card.overdue"
  | "bpm_card.deleted"
  | "bpm_card.comment_added"
  | "message.sent"
  | "member.joined"
  | "event.created"
  | "event.updated"
  | "event.deleted";

/**
 * Context used to filter which integrations should fire for this event.
 * Passed alongside the event. An integration fires iff all the filter keys
 * it has configured match this context (or the key is empty/null).
 */
export interface FilterContext {
  pipe_id?: string | null;
  phase_id?: string | null;
  from_phase_id?: string | null;
  to_phase_id?: string | null;
  board_id?: string | null;
  column_id?: string | null;
  from_column_id?: string | null;
  to_column_id?: string | null;
}

export interface DispatchInput {
  orgId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  filterContext?: FilterContext;
}

interface IntegrationRow {
  id: string;
  org_id: string;
  type: string;
  name: string;
  is_active: boolean;
  config: Record<string, string> | null;
  events: string[];
  filters: Record<string, string | null> | null;
}

/**
 * Check whether an integration's `filters` match the current event context.
 * A filter key with a non-empty value must equal the matching context key.
 * Missing / empty filter keys are treated as wildcard.
 */
function filtersMatch(
  filters: Record<string, string | null> | null | undefined,
  ctx: FilterContext | undefined
): boolean {
  if (!filters || Object.keys(filters).length === 0) return true;
  const c = ctx || {};
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === "") continue; // wildcard
    // @ts-expect-error dynamic key
    const ctxVal = c[k];
    if (ctxVal == null) return false;
    if (String(ctxVal) !== String(v)) return false;
  }
  return true;
}

/**
 * Build the HTTP request body + target URL for one integration type.
 * Returns null if the integration is unsupported / misconfigured.
 */
function buildRequest(
  integ: IntegrationRow,
  eventType: EventType,
  payload: Record<string, unknown>
): { url: string; body: unknown; headers: Record<string, string> } | null {
  const cfg = integ.config || {};
  const commonBody = {
    event: eventType,
    org_id: integ.org_id,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  if (integ.type === "webhook") {
    const url = cfg.url;
    if (!url) return null;
    return {
      url,
      body: commonBody,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "eiai-hub-webhook/1.0",
        "X-Event-Type": eventType,
      },
    };
  }

  if (integ.type === "slack") {
    const url = cfg.webhook_url;
    if (!url) return null;
    // Slack expects a text-formatted incoming webhook payload
    const title = formatSlackTitle(eventType, payload);
    return {
      url,
      body: {
        text: title,
        attachments: [
          {
            color: "#3b82f6",
            fields: [
              { title: "Event", value: eventType, short: true },
              { title: "Org", value: integ.org_id, short: true },
            ],
            footer: "EIAI Hub",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
        // also include raw payload as a pretext for power users
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${title}*\n\n\`\`\`${JSON.stringify(payload, null, 2).slice(0, 2500)}\`\`\`` },
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    };
  }

  return null;
}

function formatSlackTitle(eventType: EventType, payload: Record<string, any>): string {
  const name = payload?.card?.title || payload?.bpm_card?.title || payload?.message?.preview || "novo evento";
  return `:bell: ${eventType} — ${name}`;
}

/**
 * Main entry point. Called from the intake endpoint after resolving the
 * event from a raw DB row change.
 */
export async function dispatchEvent(
  admin: SupabaseClient,
  input: DispatchInput
): Promise<{ dispatched: number; skipped: number }> {
  const { orgId, eventType, payload, filterContext } = input;

  // 1. Find active integrations in this org that subscribe to this event
  const { data: integrations, error } = await admin
    .from("integrations")
    .select("id, org_id, type, name, is_active, config, events, filters")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .contains("events", [eventType]);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[dispatchEvent] lookup failed", error);
    return { dispatched: 0, skipped: 0 };
  }

  const candidates = (integrations || []) as IntegrationRow[];
  if (candidates.length === 0) return { dispatched: 0, skipped: 0 };

  // 2. Filter by per-integration filters + type support
  const matching = candidates.filter((i) => {
    if (!["webhook", "slack"].includes(i.type)) return false;
    return filtersMatch(i.filters, filterContext);
  });

  if (matching.length === 0) return { dispatched: 0, skipped: candidates.length };

  // 3. Fire all webhooks in parallel, log every attempt
  const results = await Promise.all(
    matching.map(async (integ) => {
      const req = buildRequest(integ, eventType, payload);
      if (!req) return { ok: false, skipped: true };

      const startedAt = Date.now();
      let status: number | null = null;
      let responseBody = "";
      let errorText: string | null = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(req.url, {
          method: "POST",
          headers: req.headers,
          body: JSON.stringify(req.body),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        status = res.status;
        responseBody = (await res.text().catch(() => "")).slice(0, 2000);
        if (!res.ok) errorText = `HTTP ${status}`;
      } catch (err: any) {
        errorText = err?.name === "AbortError" ? "Timeout after 10s" : (err?.message || "fetch failed");
      }

      const durationMs = Date.now() - startedAt;
      const ok = status !== null && status >= 200 && status < 300;

      // Log attempt (best-effort; don't throw if logging fails)
      await admin.from("webhook_deliveries").insert({
        integration_id: integ.id,
        org_id: integ.org_id,
        event_type: eventType,
        target_url: req.url,
        request_body: req.body,
        response_status: status,
        response_body: responseBody || null,
        error: errorText,
        duration_ms: durationMs,
      });

      // Bump trigger_count + last_triggered_at on success
      if (ok) {
        await admin
          .from("integrations")
          .update({
            trigger_count: ((integ as any).trigger_count || 0) + 1,
            last_triggered_at: new Date().toISOString(),
          })
          .eq("id", integ.id);
      }

      return { ok, skipped: false };
    })
  );

  const dispatched = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length + (candidates.length - matching.length);
  return { dispatched, skipped };
}
