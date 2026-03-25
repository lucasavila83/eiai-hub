import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // If started from a board card, update that card's metadata
  if (boardCardId) {
    const { data: existingCard } = await supabase
      .from("cards")
      .select("metadata")
      .eq("id", boardCardId)
      .single();

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
  }

  return NextResponse.json({ success: true, cardId: bpmCard.id });
}
