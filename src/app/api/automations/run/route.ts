import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveTemplate } from "@/lib/utils/template-resolver";

const adminClient = createAdminSupabase(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Evaluate a condition against BPM card field values.
 */
async function evaluateCondition(
  condition: { field_id: string; operator: string; value: any } | undefined,
  cardId: string
): Promise<boolean> {
  if (!condition || !condition.field_id) return true;

  const { data: fieldValue } = await adminClient
    .from("bpm_card_values")
    .select("value")
    .eq("card_id", cardId)
    .eq("field_id", condition.field_id)
    .single();

  const actual = fieldValue?.value;
  const expected = condition.value;
  const numActual = typeof actual === "string" ? parseFloat(actual) : (typeof actual === "number" ? actual : NaN);
  const numExpected = typeof expected === "string" ? parseFloat(expected) : (typeof expected === "number" ? expected : NaN);

  switch (condition.operator) {
    case "eq": return String(actual) === String(expected);
    case "neq": return String(actual) !== String(expected);
    case "gt": return !isNaN(numActual) && !isNaN(numExpected) && numActual > numExpected;
    case "gte": return !isNaN(numActual) && !isNaN(numExpected) && numActual >= numExpected;
    case "lt": return !isNaN(numActual) && !isNaN(numExpected) && numActual < numExpected;
    case "lte": return !isNaN(numActual) && !isNaN(numExpected) && numActual <= numExpected;
    case "contains": return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    case "is_empty": return actual == null || actual === "" || actual === "null";
    case "is_not_empty": return actual != null && actual !== "" && actual !== "null";
    default: return true;
  }
}

/**
 * POST /api/automations/run
 * Unified automation execution engine.
 * Supports both board and BPM automations from the unified `automations` table.
 *
 * Body: {
 *   trigger_type: string,
 *   board_id?: string,   // For board automations
 *   pipe_id?: string,    // For BPM automations
 *   phase_id?: string,   // For BPM phase-specific
 *   card_id?: string,    // Board card ID
 *   bpm_card_id?: string,// BPM card ID
 *   org_id?: string,     // Org context
 *   data?: any           // Extra trigger data
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trigger_type, board_id, pipe_id, phase_id, card_id, bpm_card_id, org_id, data } = body;

    if (!trigger_type) {
      return NextResponse.json({ error: "trigger_type obrigatório" }, { status: 400 });
    }

    // Try to get user from session (client calls), fall back to admin for server calls
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch {}

    // Build query for matching automations
    let query = adminClient
      .from("automations")
      .select("*")
      .eq("trigger_type", trigger_type)
      .eq("is_active", true);

    if (board_id) {
      query = query.eq("board_id", board_id);
    }
    if (pipe_id) {
      // Match pipe-level or phase-level automations
      query = query.eq("pipe_id", pipe_id);
      if (phase_id) {
        query = query.or(`phase_id.eq.${phase_id},phase_id.is.null`);
      }
    }
    // If neither board_id nor pipe_id, match global automations (org-level)
    if (!board_id && !pipe_id && org_id) {
      query = query.eq("org_id", org_id).is("board_id", null).is("pipe_id", null);
    }

    const { data: automations } = await query;

    if (!automations || automations.length === 0) {
      return NextResponse.json({ ran: 0 });
    }

    // Load board card if needed
    const { data: card } = card_id
      ? await adminClient.from("cards").select("*, boards!inner(org_id, name)").eq("id", card_id).single()
      : { data: null };

    // Load BPM card if needed
    const { data: bpmCard } = bpm_card_id
      ? await adminClient.from("bpm_cards").select("*").eq("id", bpm_card_id).single()
      : { data: null };

    const resolvedOrgId = org_id || (card as any)?.boards?.org_id;
    let ranCount = 0;

    for (const auto of automations) {
      try {
        const triggerConfig = auto.trigger_config || {};
        const actionConfig = auto.action_config || {};

        // ─── Trigger condition check ───────────────────────────────────
        if (trigger_type === "card_moved_to_column") {
          if (triggerConfig.column_id && triggerConfig.column_id !== data?.column_id) continue;
        }
        if (trigger_type === "progress_reached") {
          const target = triggerConfig.percent;
          const curr = data?.progress;
          const prev = data?.previous_progress ?? 0;
          if (target == null || curr == null) continue;
          if (!(prev < target && curr >= target)) continue;
        }

        // ─── Condition (alçada) check ──────────────────────────────────
        const condition = auto.condition || actionConfig.condition;
        if (condition && bpm_card_id) {
          const met = await evaluateCondition(condition, bpm_card_id);
          if (!met) {
            await adminClient.from("automation_logs").insert({
              automation_id: auto.id,
              card_id,
              bpm_card_id,
              status: "skipped",
              details_json: { trigger: trigger_type, reason: "condition_not_met" },
            });
            continue;
          }
        }

        // ─── Execute action ────────────────────────────────────────────
        switch (auto.action_type) {
          // ── Board actions ──
          case "mark_completed": {
            if (card_id) {
              await adminClient
                .from("cards")
                .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", card_id);
            }
            break;
          }
          case "set_priority": {
            if (card_id) {
              await adminClient
                .from("cards")
                .update({ priority: actionConfig.priority || "medium", updated_at: new Date().toISOString() })
                .eq("id", card_id);
            }
            break;
          }
          case "assign_member": {
            if (card_id && actionConfig.user_id) {
              const { data: existing } = await adminClient
                .from("card_assignees")
                .select("id")
                .eq("card_id", card_id)
                .eq("user_id", actionConfig.user_id)
                .single();
              if (!existing) {
                await adminClient.from("card_assignees").insert({ card_id, user_id: actionConfig.user_id });
              }
            }
            break;
          }
          case "move_to_column": {
            if (card_id && actionConfig.column_id) {
              await adminClient
                .from("cards")
                .update({ column_id: actionConfig.column_id, updated_at: new Date().toISOString() })
                .eq("id", card_id);
            }
            break;
          }

          // ── Shared actions ──
          case "send_notification":
          case "notify_chat": {
            const targetUserId = actionConfig.user_id || bpmCard?.assignee_id || userId;
            if (targetUserId && resolvedOrgId) {
              let title = actionConfig.title || actionConfig.message || "Automação executada";
              let notifBody = `Tarefa: ${card?.title || bpmCard?.title || ""}`;

              // Template resolution
              if (auto.template_id) {
                const { data: tpl } = await adminClient
                  .from("message_templates")
                  .select("subject, body")
                  .eq("id", auto.template_id)
                  .single();
                if (tpl) {
                  const vars: Record<string, string> = {
                    card_title: card?.title || bpmCard?.title || "",
                    board_name: (card as any)?.boards?.name || "",
                    due_date: card?.due_date ? new Date(card.due_date).toLocaleDateString("pt-BR") : "",
                  };
                  title = tpl.subject ? resolveTemplate(tpl.subject, vars) : title;
                  notifBody = resolveTemplate(tpl.body, vars);
                }
              }

              await adminClient.from("notifications").insert({
                org_id: resolvedOrgId,
                user_id: targetUserId,
                type: "automation",
                title,
                body: notifBody,
                link: pipe_id ? `/processes/${pipe_id}` : `/boards/${board_id}`,
                is_read: false,
                metadata: { automation_id: auto.id },
              });
            }
            break;
          }

          case "send_email": {
            // TODO: integrate with email sending
            break;
          }

          // ── BPM actions ──
          case "assign_user": {
            if (bpm_card_id && actionConfig.user_id) {
              await adminClient
                .from("bpm_cards")
                .update({ assignee_id: actionConfig.user_id, updated_at: new Date().toISOString() })
                .eq("id", bpm_card_id);
            }
            break;
          }

          case "move_to_phase": {
            if (bpm_card_id && actionConfig.target_phase_id) {
              const { data: targetPhase } = await adminClient
                .from("bpm_phases")
                .select("sla_hours, default_assignee_id")
                .eq("id", actionConfig.target_phase_id)
                .single();

              const updateData: any = {
                current_phase_id: actionConfig.target_phase_id,
                updated_at: new Date().toISOString(),
              };
              if (targetPhase?.sla_hours) {
                updateData.sla_deadline = new Date(Date.now() + targetPhase.sla_hours * 3600000).toISOString();
              }
              if (targetPhase?.default_assignee_id) {
                updateData.assignee_id = targetPhase.default_assignee_id;
              }

              await adminClient.from("bpm_cards").update(updateData).eq("id", bpm_card_id);

              await adminClient.from("bpm_card_history").insert({
                card_id: bpm_card_id,
                from_phase_id: bpmCard?.current_phase_id,
                to_phase_id: actionConfig.target_phase_id,
                action: "moved",
                notes: `Movido automaticamente por automação: ${auto.name}`,
              });
            }
            break;
          }

          case "create_board_task": {
            // Handled in task-sync.ts
            break;
          }

          case "call_webhook": {
            if (actionConfig.url) {
              try {
                await fetch(actionConfig.url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: trigger_type,
                    card: card ? { id: card.id, title: card.title } : null,
                    bpm_card: bpmCard ? { id: bpmCard.id, title: bpmCard.title } : null,
                    pipe_id,
                    phase_id,
                    timestamp: new Date().toISOString(),
                    ...actionConfig.payload,
                  }),
                });
              } catch {}
            }
            break;
          }
        }

        // Log success
        await adminClient.from("automation_logs").insert({
          automation_id: auto.id,
          card_id,
          bpm_card_id,
          status: "success",
          details_json: { trigger: trigger_type, action: auto.action_type },
        });

        // Update run count
        await adminClient
          .from("automations")
          .update({
            run_count: (auto.run_count || 0) + 1,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", auto.id);

        ranCount++;
      } catch (err: any) {
        await adminClient.from("automation_logs").insert({
          automation_id: auto.id,
          card_id,
          bpm_card_id,
          status: "error",
          details_json: { trigger: trigger_type, action: auto.action_type, error: err.message },
        });
      }
    }

    return NextResponse.json({ ran: ranCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
