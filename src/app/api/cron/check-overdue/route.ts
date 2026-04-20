/**
 * GET /api/cron/check-overdue
 *
 * Sweeps for cards (kanban + BPM) that have crossed their due date
 * without being completed, and fires `card.overdue` / `bpm_card.overdue`
 * events for each. Idempotent per day — uses `metadata.overdue_notified_at`
 * flag so the same card doesn't fire the event twice on the same day.
 *
 * Run via Vercel Cron (see vercel.json): daily at 09:00 America/Sao_Paulo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { dispatchEvent } from "@/lib/events/dispatch";
import { buildCardPayload, buildBpmCardPayload, resolveOrgIdForCard } from "@/lib/events/payload-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Accept either Vercel Cron (CRON_SECRET) or manual call (?secret=)
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET || process.env.WEBHOOK_INTAKE_SECRET;
  if (expected && provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const fired = { kanban: 0, bpm: 0 };

  // --- Kanban cards ---
  const { data: overdueCards } = await admin
    .from("cards")
    .select("*")
    .lt("due_date", today)
    .is("completed_at", null)
    .eq("is_archived", false);

  for (const card of overdueCards || []) {
    const meta = card.metadata || {};
    if (meta.overdue_notified_at === today) continue;

    const orgId = await resolveOrgIdForCard(admin, card.board_id);
    if (!orgId) continue;

    const payload = await buildCardPayload(admin, card);
    await dispatchEvent(admin, {
      orgId,
      eventType: "card.overdue",
      payload,
      filterContext: { board_id: card.board_id, column_id: card.column_id },
    });

    await admin
      .from("cards")
      .update({ metadata: { ...meta, overdue_notified_at: today } })
      .eq("id", card.id);

    fired.kanban++;
  }

  // --- BPM cards ---
  const { data: overdueBpm } = await admin
    .from("bpm_cards")
    .select("*")
    .lt("sla_deadline", now)
    .is("completed_at", null)
    .eq("is_archived", false);

  for (const card of overdueBpm || []) {
    const meta = card.metadata || {};
    if (meta.overdue_notified_at === today) continue;

    const payload = await buildBpmCardPayload(admin, card);
    await dispatchEvent(admin, {
      orgId: card.org_id,
      eventType: "bpm_card.overdue",
      payload,
      filterContext: { pipe_id: card.pipe_id, phase_id: card.current_phase_id },
    });

    await admin
      .from("bpm_cards")
      .update({ metadata: { ...meta, overdue_notified_at: today } })
      .eq("id", card.id);

    fired.bpm++;
  }

  return NextResponse.json({ ok: true, fired, timestamp: now });
}
