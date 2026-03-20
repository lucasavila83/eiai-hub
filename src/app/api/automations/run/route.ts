import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/automations/run
 * Evaluates and runs automations for a given trigger event.
 * Body: { trigger_type, board_id, card_id, data? }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { trigger_type, board_id, card_id, data } = body;

    if (!trigger_type || !board_id || !card_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find matching active automations
    const { data: automations } = await supabase
      .from("automations")
      .select("*")
      .eq("board_id", board_id)
      .eq("trigger_type", trigger_type)
      .eq("is_active", true);

    if (!automations || automations.length === 0) {
      return NextResponse.json({ ran: 0 });
    }

    let ranCount = 0;

    for (const auto of automations) {
      // Check trigger conditions
      if (trigger_type === "card_moved_to_column") {
        const targetColumnId = auto.trigger_config?.column_id;
        if (targetColumnId && targetColumnId !== data?.column_id) {
          continue; // Column doesn't match
        }
      }

      // Execute action
      try {
        switch (auto.action_type) {
          case "mark_completed": {
            await supabase
              .from("cards")
              .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("id", card_id);
            break;
          }
          case "set_priority": {
            const priority = auto.action_config?.priority || "medium";
            await supabase
              .from("cards")
              .update({ priority, updated_at: new Date().toISOString() })
              .eq("id", card_id);
            break;
          }
          case "assign_member": {
            const userId = auto.action_config?.user_id;
            if (userId) {
              // Check if already assigned
              const { data: existing } = await supabase
                .from("card_assignees")
                .select("id")
                .eq("card_id", card_id)
                .eq("user_id", userId)
                .single();
              if (!existing) {
                await supabase
                  .from("card_assignees")
                  .insert({ card_id, user_id: userId });
              }
            }
            break;
          }
          case "send_notification": {
            // Get card info for notification
            const { data: card } = await supabase
              .from("cards")
              .select("title, board_id, boards!inner(org_id)")
              .eq("id", card_id)
              .single();

            if (card) {
              const orgId = (card as any).boards?.org_id;
              const message = auto.action_config?.message || "Automação executada";
              // Get card assignees to notify
              const { data: assignees } = await supabase
                .from("card_assignees")
                .select("user_id")
                .eq("card_id", card_id);

              const userIds = assignees?.map((a) => a.user_id) || [user.id];
              for (const uid of userIds) {
                await supabase.from("notifications").insert({
                  org_id: orgId,
                  user_id: uid,
                  type: "automation",
                  title: message,
                  body: `Tarefa: ${card.title}`,
                  link: `/boards/${card.board_id}`,
                  is_read: false,
                  metadata: { automation_id: auto.id },
                });
              }
            }
            break;
          }
          case "move_to_column": {
            const columnId = auto.action_config?.column_id;
            if (columnId) {
              await supabase
                .from("cards")
                .update({ column_id: columnId, updated_at: new Date().toISOString() })
                .eq("id", card_id);
            }
            break;
          }
        }

        // Log success
        await supabase.from("automation_logs").insert({
          automation_id: auto.id,
          card_id,
          status: "success",
          details: `Ação "${auto.action_type}" executada com sucesso`,
        });

        // Update run count
        await supabase
          .from("automations")
          .update({
            run_count: (auto.run_count || 0) + 1,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", auto.id);

        ranCount++;
      } catch (err: any) {
        // Log error
        await supabase.from("automation_logs").insert({
          automation_id: auto.id,
          card_id,
          status: "error",
          details: err.message || "Erro desconhecido",
        });
      }
    }

    return NextResponse.json({ ran: ranCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
