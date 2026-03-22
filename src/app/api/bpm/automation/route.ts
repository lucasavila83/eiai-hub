import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/bpm/automation
 * Executa automações associadas a um evento BPM.
 * Body: { trigger, pipeId, phaseId, cardId, orgId }
 */
export async function POST(req: NextRequest) {
  try {
    const { trigger, pipeId, phaseId, cardId, orgId } = await req.json();

    if (!trigger || !pipeId) {
      return NextResponse.json({ error: "trigger e pipeId obrigatórios" }, { status: 400 });
    }

    // Find matching automations
    let query = adminClient
      .from("bpm_automations")
      .select("*")
      .eq("pipe_id", pipeId)
      .eq("trigger_type", trigger)
      .eq("is_active", true);

    // If phase-specific trigger, also match phase or null (applies to all)
    if (phaseId) {
      query = query.or(`phase_id.eq.${phaseId},phase_id.is.null`);
    }

    const { data: automations } = await query;

    if (!automations || automations.length === 0) {
      return NextResponse.json({ executed: 0 });
    }

    // Load card data if needed
    const { data: card } = cardId
      ? await adminClient.from("bpm_cards").select("*").eq("id", cardId).single()
      : { data: null };

    let executed = 0;

    for (const auto of automations) {
      try {
        const config = auto.config || {};

        switch (auto.action_type) {
          case "notify_chat": {
            // Send notification to assignee or specific user
            const targetUserId = config.user_id || card?.assignee_id;
            if (targetUserId && orgId) {
              await adminClient.from("notifications").insert({
                org_id: orgId,
                user_id: targetUserId,
                type: "bpm_automation",
                title: config.title || "Automação BPM",
                body: config.message || `Automação disparada para card "${card?.title || ""}".`,
                link: `/processes/${pipeId}`,
                metadata: { automation_id: auto.id, bpm_card_id: cardId },
              });
            }
            break;
          }

          case "assign_user": {
            // Assign specific user to the card
            if (config.user_id && cardId) {
              await adminClient
                .from("bpm_cards")
                .update({ assignee_id: config.user_id, updated_at: new Date().toISOString() })
                .eq("id", cardId);
            }
            break;
          }

          case "send_email": {
            // Email sending would use Resend - log for now
            // TODO: integrate with sendInviteEmail or create sendBpmEmail
            break;
          }

          case "move_to_phase": {
            // Move card to specific phase
            if (config.target_phase_id && cardId) {
              await adminClient
                .from("bpm_cards")
                .update({
                  current_phase_id: config.target_phase_id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", cardId);

              await adminClient.from("bpm_card_history").insert({
                card_id: cardId,
                from_phase_id: card?.current_phase_id,
                to_phase_id: config.target_phase_id,
                action: "moved",
                notes: `Movido automaticamente por automação: ${auto.name}`,
              });
            }
            break;
          }

          case "create_board_task": {
            // Already handled in task-sync.ts during phase move
            break;
          }

          case "call_webhook": {
            // Call external webhook
            if (config.url) {
              try {
                await fetch(config.url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: trigger,
                    card: card ? { id: card.id, title: card.title, phase_id: card.current_phase_id } : null,
                    pipe_id: pipeId,
                    phase_id: phaseId,
                    timestamp: new Date().toISOString(),
                    ...config.payload,
                  }),
                });
              } catch {
                // Log failure
              }
            }
            break;
          }
        }

        // Log success
        await adminClient.from("bpm_automation_logs").insert({
          automation_id: auto.id,
          bpm_card_id: cardId,
          status: "success",
          details: { trigger, action: auto.action_type },
        });

        executed++;
      } catch (err: any) {
        // Log failure
        await adminClient.from("bpm_automation_logs").insert({
          automation_id: auto.id,
          bpm_card_id: cardId,
          status: "failed",
          details: { trigger, action: auto.action_type, error: err.message },
        });
      }
    }

    return NextResponse.json({ executed, total: automations.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
