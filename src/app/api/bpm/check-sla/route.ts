import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/bpm/check-sla
 * Verifica cards com SLA vencido ou prestes a vencer.
 * Pode ser chamado por cron job (Vercel Cron ou externo).
 */
export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const warningThreshold = new Date(now.getTime() + 4 * 3600000); // 4h antes

    // Cards com SLA vencido (não concluídos)
    const { data: expiredCards } = await adminClient
      .from("bpm_cards")
      .select("id, title, pipe_id, current_phase_id, assignee_id, sla_deadline, org_id")
      .is("completed_at", null)
      .eq("is_archived", false)
      .not("sla_deadline", "is", null)
      .lt("sla_deadline", now.toISOString());

    // Cards com SLA prestes a vencer (< 4h)
    const { data: warningCards } = await adminClient
      .from("bpm_cards")
      .select("id, title, pipe_id, current_phase_id, assignee_id, sla_deadline, org_id")
      .is("completed_at", null)
      .eq("is_archived", false)
      .not("sla_deadline", "is", null)
      .gte("sla_deadline", now.toISOString())
      .lte("sla_deadline", warningThreshold.toISOString());

    const expired = expiredCards || [];
    const warning = warningCards || [];

    // Create notifications for expired cards
    for (const card of expired) {
      if (!card.assignee_id) continue;

      // Check if notification already sent (avoid duplicates)
      const { data: existing } = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", card.assignee_id)
        .eq("type", "bpm_sla_expired")
        .contains("metadata", { bpm_card_id: card.id })
        .single();

      if (existing) continue;

      await adminClient.from("notifications").insert({
        org_id: card.org_id,
        user_id: card.assignee_id,
        type: "bpm_sla_expired",
        title: "SLA vencido",
        body: `O prazo do card "${card.title}" venceu.`,
        link: `/processes/${card.pipe_id}`,
        metadata: { bpm_card_id: card.id, bpm_phase_id: card.current_phase_id },
      });
    }

    // Create notifications for warning cards
    for (const card of warning) {
      if (!card.assignee_id) continue;

      const { data: existing } = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", card.assignee_id)
        .eq("type", "bpm_sla_warning")
        .contains("metadata", { bpm_card_id: card.id })
        .single();

      if (existing) continue;

      await adminClient.from("notifications").insert({
        org_id: card.org_id,
        user_id: card.assignee_id,
        type: "bpm_sla_warning",
        title: "SLA prestes a vencer",
        body: `O prazo do card "${card.title}" vence em breve.`,
        link: `/processes/${card.pipe_id}`,
        metadata: { bpm_card_id: card.id, bpm_phase_id: card.current_phase_id },
      });
    }

    return NextResponse.json({
      expired: expired.length,
      warning: warning.length,
      checked_at: now.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
