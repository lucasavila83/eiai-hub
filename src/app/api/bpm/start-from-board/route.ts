import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureBpmLabel } from "@/lib/bpm/task-sync";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { pipeId, title, values, boardCardId } = body;

  if (!pipeId || !title?.trim()) {
    return NextResponse.json({ error: "pipeId e title são obrigatórios" }, { status: 400 });
  }

  // Get pipe info
  const { data: pipe } = await supabase
    .from("bpm_pipes")
    .select("id, name, org_id")
    .eq("id", pipeId)
    .single();

  if (!pipe) {
    return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });
  }

  // Get start phase
  const { data: phases } = await supabase
    .from("bpm_phases")
    .select("id, name, is_start, default_assignee_id, sla_hours")
    .eq("pipe_id", pipeId)
    .order("position");

  const startPhase = phases?.find((p) => p.is_start) || phases?.[0];
  if (!startPhase) {
    return NextResponse.json({ error: "Processo sem fases" }, { status: 400 });
  }

  // Get fields for start phase
  const { data: startFields } = await supabase
    .from("bpm_fields")
    .select("id, label, field_type, is_required, options")
    .eq("phase_id", startPhase.id)
    .order("position");

  // Calculate SLA deadline
  const slaDeadline = startPhase.sla_hours
    ? new Date(Date.now() + startPhase.sla_hours * 3600000).toISOString()
    : null;

  // Create BPM card
  const { data: bpmCard, error: cardErr } = await supabase
    .from("bpm_cards")
    .insert({
      pipe_id: pipeId,
      title: title.trim(),
      current_phase_id: startPhase.id,
      created_by: user.id,
      assignee_id: startPhase.default_assignee_id || null,
      org_id: pipe.org_id,
      sla_deadline: slaDeadline,
      source_board_card_id: boardCardId || null,
    })
    .select("id")
    .single();

  if (cardErr || !bpmCard) {
    return NextResponse.json({ error: "Erro ao criar card: " + (cardErr?.message || "") }, { status: 500 });
  }

  // Save field values
  if (values && typeof values === "object") {
    const entries = Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length > 0) {
      await supabase.from("bpm_card_values").insert(
        entries.map(([fieldId, value]) => ({
          card_id: bpmCard.id,
          field_id: fieldId,
          value,
        }))
      );
    }
  }

  // Add history entry
  await supabase.from("bpm_card_history").insert({
    card_id: bpmCard.id,
    to_phase_id: startPhase.id,
    moved_by: user.id,
    action: "created",
  });

  // If started from a board card: add checklist + label + link + metadata
  if (boardCardId) {
    const { data: existingCard } = await supabase
      .from("cards")
      .select("metadata, board_id")
      .eq("id", boardCardId)
      .single();

    // Update card metadata
    await supabase
      .from("cards")
      .update({
        metadata: {
          ...(existingCard?.metadata || {}),
          bpm_card_id: bpmCard.id,
          bpm_pipe_id: pipeId,
          bpm_pipe_name: pipe.name,
          linked_to_bpm: true,
        },
      })
      .eq("id", boardCardId);

    // Apply BPM label to the board card
    if (existingCard?.board_id) {
      const labelId = await ensureBpmLabel(supabase, existingCard.board_id, pipeId, pipe.name);
      if (labelId) {
        // Check if already has this label
        const { data: existingLabel } = await supabase
          .from("card_labels")
          .select("id")
          .eq("card_id", boardCardId)
          .eq("label_id", labelId)
          .limit(1);
        if (!existingLabel?.length) {
          await supabase.from("card_labels").insert({ card_id: boardCardId, label_id: labelId });
        }
      }
    }

    // Create checklist on the board card with the first phase's fields
    const fieldsForChecklist = (startFields || []).filter(
      (f) => f.field_type !== "checklist"
    );
    const checklistFieldsFromBpm = (startFields || []).filter(
      (f) => f.field_type === "checklist"
    );

    // Create a checklist with regular fields as items (to be filled)
    if (fieldsForChecklist.length > 0) {
      const { data: cl } = await supabase
        .from("checklists")
        .insert({
          card_id: boardCardId,
          name: `📋 ${pipe.name} — ${startPhase.name}`,
          position: 0,
        })
        .select("id")
        .single();

      if (cl) {
        const items = fieldsForChecklist.map((f, i) => {
          // For fields that have values, mark as completed
          const val = values?.[f.id];
          const hasValue = val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
          return {
            checklist_id: cl.id,
            title: `${f.label}${hasValue ? `: ${typeof val === "string" ? val : JSON.stringify(val)}` : ""}`,
            is_completed: hasValue,
            position: i,
          };
        });
        await supabase.from("checklist_items").insert(items);
      }
    }

    // Mirror BPM checklist fields as separate board checklists
    for (let ci = 0; ci < checklistFieldsFromBpm.length; ci++) {
      const cf = checklistFieldsFromBpm[ci];
      const checklistValue = values?.[cf.id];
      const items: { label: string; checked: boolean }[] = Array.isArray(checklistValue)
        ? checklistValue
        : (cf.options || []).map((o: any) => ({ label: o.label, checked: false }));

      const { data: cl } = await supabase
        .from("checklists")
        .insert({
          card_id: boardCardId,
          name: cf.label,
          position: (fieldsForChecklist.length > 0 ? 1 : 0) + ci,
        })
        .select("id")
        .single();

      if (cl) {
        await supabase.from("checklist_items").insert(
          items.map((item, i) => ({
            checklist_id: cl.id,
            title: item.label,
            is_completed: item.checked,
            position: i,
          }))
        );
      }
    }

    // Create bpm_task_link
    await supabase.from("bpm_task_links").insert({
      bpm_card_id: bpmCard.id,
      board_card_id: boardCardId,
      phase_id: startPhase.id,
      is_active: true,
    });

    // Assign the phase's default assignee to the board card
    if (startPhase.default_assignee_id) {
      const { data: existingAssignee } = await supabase
        .from("card_assignees")
        .select("id")
        .eq("card_id", boardCardId)
        .eq("user_id", startPhase.default_assignee_id)
        .limit(1);
      if (!existingAssignee?.length) {
        await supabase.from("card_assignees").insert({
          card_id: boardCardId,
          user_id: startPhase.default_assignee_id,
        });
      }
    }
  }

  return NextResponse.json({ success: true, cardId: bpmCard.id });
}
