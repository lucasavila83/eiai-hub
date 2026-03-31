import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Evaluate a condition against card field values.
 * Condition format: { field_id, operator, value }
 * Operators: eq, neq, gt, gte, lt, lte, contains, is_empty, is_not_empty
 */
async function evaluateCondition(
  condition: { field_id: string; operator: string; value: any } | undefined,
  cardId: string
): Promise<boolean> {
  if (!condition || !condition.field_id) return true; // No condition = always true

  // Get the field value from bpm_card_values
  const { data: fieldValue } = await adminClient
    .from("bpm_card_values")
    .select("value")
    .eq("card_id", cardId)
    .eq("field_id", condition.field_id)
    .single();

  const actual = fieldValue?.value;
  const expected = condition.value;

  // Parse numbers for comparison
  const numActual = typeof actual === "string" ? parseFloat(actual) : (typeof actual === "number" ? actual : NaN);
  const numExpected = typeof expected === "string" ? parseFloat(expected) : (typeof expected === "number" ? expected : NaN);

  switch (condition.operator) {
    case "eq":
      return String(actual) === String(expected);
    case "neq":
      return String(actual) !== String(expected);
    case "gt":
      return !isNaN(numActual) && !isNaN(numExpected) && numActual > numExpected;
    case "gte":
      return !isNaN(numActual) && !isNaN(numExpected) && numActual >= numExpected;
    case "lt":
      return !isNaN(numActual) && !isNaN(numExpected) && numActual < numExpected;
    case "lte":
      return !isNaN(numActual) && !isNaN(numExpected) && numActual <= numExpected;
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    case "is_empty":
      return actual === null || actual === undefined || actual === "" || actual === "null";
    case "is_not_empty":
      return actual !== null && actual !== undefined && actual !== "" && actual !== "null";
    default:
      return true;
  }
}

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

        // ─── Evaluate condition before executing ───────────────────────
        if (config.condition && cardId) {
          const conditionMet = await evaluateCondition(config.condition, cardId);
          if (!conditionMet) {
            // Log as skipped
            await adminClient.from("bpm_automation_logs").insert({
              automation_id: auto.id,
              bpm_card_id: cardId,
              status: "skipped",
              details: { trigger, action: auto.action_type, reason: "condition_not_met" },
            });
            continue;
          }
        }

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
            break;
          }

          case "move_to_phase": {
            // Move card to specific phase
            if (config.target_phase_id && cardId) {
              // Calculate SLA for target phase
              const { data: targetPhase } = await adminClient
                .from("bpm_phases")
                .select("sla_hours, default_assignee_id")
                .eq("id", config.target_phase_id)
                .single();

              const updateData: any = {
                current_phase_id: config.target_phase_id,
                updated_at: new Date().toISOString(),
              };

              if (targetPhase?.sla_hours) {
                updateData.sla_deadline = new Date(
                  Date.now() + targetPhase.sla_hours * 3600000
                ).toISOString();
              }

              if (targetPhase?.default_assignee_id) {
                updateData.assignee_id = targetPhase.default_assignee_id;
              }

              await adminClient
                .from("bpm_cards")
                .update(updateData)
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
