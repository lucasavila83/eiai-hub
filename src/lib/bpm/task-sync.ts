import { SupabaseClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────
 * Label BPM — uma label roxa por processo
 * ───────────────────────────────────────────── */

export async function ensureBpmLabel(
  supabase: SupabaseClient,
  boardId: string,
  pipeId: string,
  pipeName: string,
): Promise<string | null> {
  // Check if label already exists for this pipe
  const { data: existing } = await supabase
    .from("labels")
    .select("id")
    .eq("board_id", boardId)
    .contains("metadata", { pipe_id: pipeId })
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  // Create new label
  const { data: label } = await supabase
    .from("labels")
    .insert({
      board_id: boardId,
      name: pipeName,
      color: "#8b5cf6",
      metadata: { is_bpm: true, pipe_id: pipeId },
    })
    .select("id")
    .single();

  return label?.id ?? null;
}

/* ─────────────────────────────────────────────
 * Criar tarefa no Board a partir do BPM
 * ───────────────────────────────────────────── */

export interface BpmChecklistField {
  label: string;
  items: { label: string; checked: boolean }[];
}

export interface BpmBoardTaskParams {
  bpmCardId: string;
  bpmCardTitle: string;
  pipeId: string;
  pipeName: string;
  phaseName: string;
  phaseId: string;
  assigneeId: string;
  orgId: string;
  slaDeadline: string | null;
  requiredFields: { label: string }[];
  checklistFields?: BpmChecklistField[];
  fieldIds?: string[];
}

export async function createBoardTaskFromBpm(
  supabase: SupabaseClient,
  params: BpmBoardTaskParams,
): Promise<string | null> {
  const {
    bpmCardId, bpmCardTitle, pipeId, pipeName, phaseName, phaseId,
    assigneeId, orgId, slaDeadline, requiredFields, checklistFields, fieldIds,
  } = params;

  // Find a board where the assignee is a member (prefer their board)
  const { data: memberBoards } = await supabase
    .from("board_members")
    .select("board_id")
    .eq("user_id", assigneeId);

  const memberBoardIds = (memberBoards || []).map((m) => m.board_id);

  // Get non-archived boards from the org
  const { data: boards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_archived", false)
    .order("created_at")
    .limit(10);

  if (!boards || boards.length === 0) return null;

  // Prefer a board where assignee is member, else first available
  const targetBoard =
    boards.find((b) => memberBoardIds.includes(b.id)) || boards[0];

  // Find the first non-done column
  const { data: columns } = await supabase
    .from("columns")
    .select("id, name, is_done_column")
    .eq("board_id", targetBoard.id)
    .order("position")
    .limit(5);

  if (!columns || columns.length === 0) return null;

  const targetColumn = columns.find((c) => !c.is_done_column) || columns[0];

  // Build description
  const description = [
    `**Processo:** ${pipeName}`,
    `**Fase:** ${phaseName}`,
    `**Card:** ${bpmCardTitle}`,
    "",
    requiredFields.length > 0
      ? `**Campos a preencher:**\n${requiredFields.map((f) => `- [ ] ${f.label}`).join("\n")}`
      : "",
    "",
    `_Tarefa gerada automaticamente pelo processo BPM._`,
  ].filter(Boolean).join("\n");

  const dueDate = slaDeadline ? slaDeadline.split("T")[0] : null;

  // Create the board card
  const { data: boardCard } = await supabase
    .from("cards")
    .insert({
      column_id: targetColumn.id,
      board_id: targetBoard.id,
      title: `[${pipeName}] ${phaseName} — ${bpmCardTitle}`,
      description,
      priority: "medium",
      due_date: dueDate,
      position: 0,
      metadata: {
        bpm_card_id: bpmCardId,
        bpm_phase_id: phaseId,
        bpm_pipe_name: pipeName,
        bpm_phase_name: phaseName,
        is_bpm_task: true,
        bpm_field_ids: fieldIds || [],
      },
    })
    .select("id")
    .single();

  if (!boardCard) return null;

  // Log activity: card created from BPM
  await supabase.from("activity_logs").insert({
    card_id: boardCard.id,
    user_id: assigneeId,
    action: "created",
    details: {
      title: `[${pipeName}] ${phaseName} — ${bpmCardTitle}`,
      source: "bpm",
      pipe_name: pipeName,
      phase_name: phaseName,
    },
  });

  // Assign to the responsible person
  await supabase.from("card_assignees").insert({
    card_id: boardCard.id,
    user_id: assigneeId,
  });

  // Apply BPM label
  const labelId = await ensureBpmLabel(supabase, targetBoard.id, pipeId, pipeName);
  if (labelId) {
    await supabase.from("card_labels").insert({
      card_id: boardCard.id,
      label_id: labelId,
    });
  }

  // Create checklists — required fields checklist
  if (requiredFields.length > 0) {
    const { data: checklist } = await supabase
      .from("checklists")
      .insert({
        card_id: boardCard.id,
        name: "Campos obrigatórios do processo",
        position: 0,
      })
      .select("id")
      .single();

    if (checklist) {
      const items = requiredFields.map((f, i) => ({
        checklist_id: checklist.id,
        title: f.label,
        is_completed: false,
        position: i,
      }));
      await supabase.from("checklist_items").insert(items);
    }
  }

  // Mirror BPM checklist fields as board checklists
  if (checklistFields && checklistFields.length > 0) {
    for (let ci = 0; ci < checklistFields.length; ci++) {
      const cf = checklistFields[ci];
      const { data: checklist } = await supabase
        .from("checklists")
        .insert({
          card_id: boardCard.id,
          name: cf.label,
          position: (requiredFields.length > 0 ? 1 : 0) + ci,
        })
        .select("id")
        .single();

      if (checklist) {
        const items = cf.items.map((item, i) => ({
          checklist_id: checklist.id,
          title: item.label,
          is_completed: item.checked,
          position: i,
        }));
        await supabase.from("checklist_items").insert(items);
      }
    }
  }

  // Create bpm_task_link
  await supabase.from("bpm_task_links").insert({
    bpm_card_id: bpmCardId,
    board_card_id: boardCard.id,
    phase_id: phaseId,
    is_active: true,
  });

  // Mirror to hub boards (server-side call)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    await fetch(`${baseUrl}/api/cards/mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: boardCard.id, board_id: targetBoard.id }),
    });
  } catch {}

  // Sync due date to Google Calendar of assignees
  if (boardCard.due_date) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/cards/gcal-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: boardCard.id }),
      });
    } catch {}
  }

  return boardCard.id;
}

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

export async function deactivatePreviousTaskLinks(
  supabase: SupabaseClient,
  bpmCardId: string,
): Promise<void> {
  await supabase
    .from("bpm_task_links")
    .update({ is_active: false })
    .eq("bpm_card_id", bpmCardId)
    .eq("is_active", true);
}

export function isBpmTask(metadata: any): boolean {
  return metadata?.is_bpm_task === true;
}

export function getBpmCardId(metadata: any): string | null {
  return metadata?.bpm_card_id || null;
}
