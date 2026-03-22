import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cria uma tarefa no board do responsável quando um card BPM entra numa fase.
 * Retorna o ID do card criado no board, ou null se não foi possível.
 */
export async function createBoardTaskFromBpm(
  supabase: SupabaseClient,
  params: {
    bpmCardId: string;
    bpmCardTitle: string;
    pipeName: string;
    phaseName: string;
    phaseId: string;
    assigneeId: string;
    orgId: string;
    slaDeadline: string | null;
    requiredFields: { label: string }[];
  }
): Promise<string | null> {
  const {
    bpmCardId, bpmCardTitle, pipeName, phaseName, phaseId,
    assigneeId, orgId, slaDeadline, requiredFields,
  } = params;

  // Find a board where the assignee has access (prefer team board or first available)
  const { data: boards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_archived", false)
    .order("created_at")
    .limit(10);

  if (!boards || boards.length === 0) return null;

  // Use first board (could be improved to find assignee's team board)
  const targetBoard = boards[0];

  // Find the first column (usually "A Fazer" or similar)
  const { data: columns } = await supabase
    .from("columns")
    .select("id, name, is_done_column")
    .eq("board_id", targetBoard.id)
    .order("position")
    .limit(5);

  if (!columns || columns.length === 0) return null;

  // Pick first non-done column
  const targetColumn = columns.find((c) => !c.is_done_column) || columns[0];

  // Build description with process context
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

  // Calculate due date from SLA
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
      },
    })
    .select("id")
    .single();

  if (!boardCard) return null;

  // Assign to the responsible person
  await supabase.from("card_assignees").insert({
    card_id: boardCard.id,
    user_id: assigneeId,
  });

  // Create checklist with required fields if any
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

  // Create bpm_task_link
  await supabase.from("bpm_task_links").insert({
    bpm_card_id: bpmCardId,
    board_card_id: boardCard.id,
    phase_id: phaseId,
    is_active: true,
  });

  return boardCard.id;
}

/**
 * Desativa links de tarefas anteriores quando o card BPM avança de fase.
 */
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

/**
 * Verifica se um card do board é uma tarefa BPM e retorna os dados.
 */
export function isBpmTask(metadata: any): boolean {
  return metadata?.is_bpm_task === true;
}

/**
 * Extrai o bpm_card_id do metadata de um card do board.
 */
export function getBpmCardId(metadata: any): string | null {
  return metadata?.bpm_card_id || null;
}
