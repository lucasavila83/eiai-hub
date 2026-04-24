/**
 * POST /api/events/webhook-intake
 *
 * Receives raw row changes from our Postgres triggers (via pg_net) and
 * translates them into domain events, then calls dispatchEvent() for each
 * applicable event. Authenticated via `X-Webhook-Secret` header, whose value
 * must match `WEBHOOK_INTAKE_SECRET` env var (also stored in DB app_settings).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { dispatchEvent, type EventType, type FilterContext } from "@/lib/events/dispatch";
import {
  buildBpmCardCommentPayload,
  buildBpmCardFieldPayload,
  buildBpmCardPayload,
  buildCardAssigneePayload,
  buildCardCommentPayload,
  buildCardPayload,
  buildEventPayload,
  buildMemberPayload,
  buildMessagePayload,
  resolveOrgIdForCard,
  resolveOrgIdForChannel,
} from "@/lib/events/payload-builder";
import { sendPushToUsers } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface IntakeBody {
  op: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, any> | null;
  old_record: Record<string, any> | null;
  ts: number;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const provided = req.headers.get("x-webhook-secret");
  const expected = process.env.WEBHOOK_INTAKE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "WEBHOOK_INTAKE_SECRET not configured" }, { status: 500 });
  }
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: IntakeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { op, table, record, old_record } = body;

  try {
    const results = await routeEvent(op, table, record, old_record);
    return NextResponse.json({
      ok: true,
      table,
      op,
      events_fired: results,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[webhook-intake] error", err);
    return NextResponse.json({ error: err?.message || "intake failed" }, { status: 500 });
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "webhook-intake",
    time: new Date().toISOString(),
  });
}

// ============================================================
// Routing — table + op → event type(s) + payload + filter context
// ============================================================

async function routeEvent(
  op: string,
  table: string,
  record: any,
  oldRecord: any
): Promise<Array<{ event: EventType; dispatched: number }>> {
  const fired: Array<{ event: EventType; dispatched: number }> = [];

  // -------------------- CARDS (kanban) --------------------
  if (table === "cards") {
    const row = record || oldRecord;
    const orgId = await resolveOrgIdForCard(admin, row.board_id);
    if (!orgId) return fired;

    const filterCtx: FilterContext = {
      board_id: row.board_id,
      column_id: row.column_id,
    };

    if (op === "INSERT") {
      const payload = await buildCardPayload(admin, row);
      const r = await dispatchEvent(admin, {
        orgId, eventType: "card.created", payload, filterContext: filterCtx,
      });
      fired.push({ event: "card.created", dispatched: r.dispatched });
    } else if (op === "UPDATE") {
      const movedColumn = oldRecord?.column_id !== record?.column_id;
      const justCompleted = !oldRecord?.completed_at && record?.completed_at;
      const payload = await buildCardPayload(admin, record);

      if (movedColumn) {
        const moveCtx: FilterContext = {
          board_id: row.board_id,
          from_column_id: oldRecord.column_id,
          to_column_id: record.column_id,
          column_id: record.column_id,
        };
        const r = await dispatchEvent(admin, {
          orgId, eventType: "card.moved", payload, filterContext: moveCtx,
        });
        fired.push({ event: "card.moved", dispatched: r.dispatched });
      }
      if (justCompleted) {
        const r = await dispatchEvent(admin, {
          orgId, eventType: "card.completed", payload, filterContext: filterCtx,
        });
        fired.push({ event: "card.completed", dispatched: r.dispatched });
      }
      // Always emit updated too (subscribers can opt into it separately)
      const r = await dispatchEvent(admin, {
        orgId, eventType: "card.updated", payload, filterContext: filterCtx,
      });
      fired.push({ event: "card.updated", dispatched: r.dispatched });
    } else if (op === "DELETE") {
      const r = await dispatchEvent(admin, {
        orgId,
        eventType: "card.deleted",
        payload: { card: oldRecord },
        filterContext: filterCtx,
      });
      fired.push({ event: "card.deleted", dispatched: r.dispatched });
    }
    return fired;
  }

  // -------------------- BPM CARDS --------------------
  if (table === "bpm_cards") {
    const row = record || oldRecord;
    const orgId = row.org_id;
    if (!orgId) return fired;

    const filterCtx: FilterContext = {
      pipe_id: row.pipe_id,
      phase_id: row.current_phase_id,
    };

    if (op === "INSERT") {
      const payload = await buildBpmCardPayload(admin, row);
      const r = await dispatchEvent(admin, {
        orgId, eventType: "bpm_card.created", payload, filterContext: filterCtx,
      });
      fired.push({ event: "bpm_card.created", dispatched: r.dispatched });
    } else if (op === "UPDATE") {
      const movedPhase = oldRecord?.current_phase_id !== record?.current_phase_id;
      const justCompleted = !oldRecord?.completed_at && record?.completed_at;
      const payload = await buildBpmCardPayload(admin, record);

      if (movedPhase) {
        const moveCtx: FilterContext = {
          pipe_id: row.pipe_id,
          from_phase_id: oldRecord.current_phase_id,
          to_phase_id: record.current_phase_id,
          phase_id: record.current_phase_id,
        };
        const r = await dispatchEvent(admin, {
          orgId, eventType: "bpm_card.moved", payload, filterContext: moveCtx,
        });
        fired.push({ event: "bpm_card.moved", dispatched: r.dispatched });
      }
      if (justCompleted) {
        const r = await dispatchEvent(admin, {
          orgId, eventType: "bpm_card.completed", payload, filterContext: filterCtx,
        });
        fired.push({ event: "bpm_card.completed", dispatched: r.dispatched });
      }
    } else if (op === "DELETE") {
      const r = await dispatchEvent(admin, {
        orgId,
        eventType: "bpm_card.deleted",
        payload: { bpm_card: oldRecord },
        filterContext: filterCtx,
      });
      fired.push({ event: "bpm_card.deleted", dispatched: r.dispatched });
    }
    return fired;
  }

  // -------------------- MESSAGES (chat) --------------------
  if (table === "messages" && op === "INSERT") {
    const orgId = await resolveOrgIdForChannel(admin, record.channel_id);
    if (!orgId) return fired;
    const payload = await buildMessagePayload(admin, record);
    const r = await dispatchEvent(admin, {
      orgId, eventType: "message.sent", payload,
    });
    fired.push({ event: "message.sent", dispatched: r.dispatched });

    // Also fan out a web-push notification to every channel member except
    // the sender. Non-blocking — if push isn't configured yet, we just log.
    try {
      const senderId = record.user_id as string;
      const channelId = record.channel_id as string;
      const { data: members } = await admin
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channelId)
        .eq("is_hidden", false);

      const targets = (members || [])
        .map((m: any) => m.user_id as string)
        .filter((uid) => uid && uid !== senderId);

      if (targets.length > 0) {
        const sender: any = (payload as any).sender || {};
        const channel: any = (payload as any).channel || {};
        const senderName = sender.full_name || sender.email || "Alguém";
        const channelName =
          channel.type === "dm" ? senderName : channel.name ? `#${channel.name}` : "Chat";
        const preview = (payload as any).message?.preview || "Nova mensagem";
        await sendPushToUsers(targets, {
          title: channelName,
          body: `${senderName}: ${preview}`,
          url: `/chat/${channelId}`,
          tag: `chat-${channelId}`,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[intake] push-on-message failed:", err);
    }

    return fired;
  }

  // -------------------- ORG MEMBERS --------------------
  if (table === "org_members" && op === "INSERT") {
    const orgId = record.org_id;
    const payload = await buildMemberPayload(admin, record);
    const r = await dispatchEvent(admin, {
      orgId, eventType: "member.joined", payload,
    });
    fired.push({ event: "member.joined", dispatched: r.dispatched });
    return fired;
  }

  // -------------------- CARD COMMENTS --------------------
  if (table === "card_comments" && op === "INSERT") {
    // Need to resolve org_id via card → board
    const { data: cardRow } = await admin
      .from("cards")
      .select("board_id")
      .eq("id", record.card_id)
      .maybeSingle();
    if (!cardRow) return fired;
    const orgId = await resolveOrgIdForCard(admin, cardRow.board_id);
    if (!orgId) return fired;
    const payload = await buildCardCommentPayload(admin, record);
    const r = await dispatchEvent(admin, {
      orgId, eventType: "card.comment_added", payload,
      filterContext: { board_id: cardRow.board_id },
    });
    fired.push({ event: "card.comment_added", dispatched: r.dispatched });
    return fired;
  }

  // -------------------- BPM CARD COMMENTS --------------------
  if (table === "bpm_card_comments" && op === "INSERT") {
    const { data: cardRow } = await admin
      .from("bpm_cards")
      .select("org_id, pipe_id, current_phase_id")
      .eq("id", record.card_id)
      .maybeSingle();
    if (!cardRow) return fired;
    const payload = await buildBpmCardCommentPayload(admin, record);
    const r = await dispatchEvent(admin, {
      orgId: cardRow.org_id,
      eventType: "bpm_card.comment_added",
      payload,
      filterContext: { pipe_id: cardRow.pipe_id, phase_id: cardRow.current_phase_id },
    });
    fired.push({ event: "bpm_card.comment_added", dispatched: r.dispatched });
    return fired;
  }

  // -------------------- CALENDAR EVENTS --------------------
  if (table === "events") {
    const row = record || oldRecord;
    const orgId = row.org_id;
    if (op === "INSERT") {
      const payload = await buildEventPayload(admin, row);
      const r = await dispatchEvent(admin, { orgId, eventType: "event.created", payload });
      fired.push({ event: "event.created", dispatched: r.dispatched });
    } else if (op === "UPDATE") {
      const payload = await buildEventPayload(admin, row);
      const r = await dispatchEvent(admin, { orgId, eventType: "event.updated", payload });
      fired.push({ event: "event.updated", dispatched: r.dispatched });
    } else if (op === "DELETE") {
      const r = await dispatchEvent(admin, {
        orgId,
        eventType: "event.deleted",
        payload: { event: oldRecord },
      });
      fired.push({ event: "event.deleted", dispatched: r.dispatched });
    }
    return fired;
  }

  // -------------------- BPM CARD VALUES (campos) --------------------
  if (table === "bpm_card_values" && (op === "INSERT" || op === "UPDATE")) {
    const row = record;
    // Resolve the owning BPM card for org/pipe/phase context
    const { data: cardRow } = await admin
      .from("bpm_cards")
      .select("id, org_id, pipe_id, current_phase_id")
      .eq("id", row.card_id)
      .maybeSingle();
    if (!cardRow) return fired;
    const { data: fieldRow } = await admin
      .from("bpm_fields")
      .select("id, field_key, phase_id")
      .eq("id", row.field_id)
      .maybeSingle();

    const payload = await buildBpmCardFieldPayload(admin, row, oldRecord);
    const filterCtx: FilterContext = {
      pipe_id: cardRow.pipe_id,
      phase_id: cardRow.current_phase_id,
      field_id: row.field_id,
      field_key: fieldRow?.field_key || null,
    };

    const newVal = row.value;
    const oldVal = oldRecord?.value;
    const wasEmpty = oldVal == null || oldVal === "" ||
                     (typeof oldVal === "object" && Array.isArray(oldVal) && oldVal.length === 0);
    const isFilled = newVal != null && newVal !== "" &&
                     !(Array.isArray(newVal) && newVal.length === 0);

    // field_filled: vazio → preenchido (ou INSERT com valor)
    if (isFilled && (op === "INSERT" || wasEmpty)) {
      const r = await dispatchEvent(admin, {
        orgId: cardRow.org_id,
        eventType: "bpm_card.field_filled",
        payload,
        filterContext: filterCtx,
      });
      fired.push({ event: "bpm_card.field_filled", dispatched: r.dispatched });
    }

    // field_updated: sempre que o valor mudar (inclui INSERT se quiser ver "novo valor")
    const changed = op === "INSERT" ? isFilled : JSON.stringify(oldVal) !== JSON.stringify(newVal);
    if (changed) {
      const r = await dispatchEvent(admin, {
        orgId: cardRow.org_id,
        eventType: "bpm_card.field_updated",
        payload,
        filterContext: filterCtx,
      });
      fired.push({ event: "bpm_card.field_updated", dispatched: r.dispatched });
    }
    return fired;
  }

  // -------------------- CARD ASSIGNEES --------------------
  if (table === "card_assignees") {
    if (op === "INSERT") {
      const { data: cardRow } = await admin.from("cards").select("board_id").eq("id", record.card_id).maybeSingle();
      if (!cardRow) return fired;
      const orgId = await resolveOrgIdForCard(admin, cardRow.board_id);
      if (!orgId) return fired;
      const payload = await buildCardAssigneePayload(admin, record);
      const r = await dispatchEvent(admin, {
        orgId, eventType: "card.assigned", payload,
        filterContext: { board_id: cardRow.board_id },
      });
      fired.push({ event: "card.assigned", dispatched: r.dispatched });
    } else if (op === "DELETE") {
      const { data: cardRow } = await admin.from("cards").select("board_id").eq("id", oldRecord.card_id).maybeSingle();
      if (!cardRow) return fired;
      const orgId = await resolveOrgIdForCard(admin, cardRow.board_id);
      if (!orgId) return fired;
      const payload = await buildCardAssigneePayload(admin, oldRecord);
      const r = await dispatchEvent(admin, {
        orgId, eventType: "card.unassigned", payload,
        filterContext: { board_id: cardRow.board_id },
      });
      fired.push({ event: "card.unassigned", dispatched: r.dispatched });
    }
    return fired;
  }

  return fired;
}
