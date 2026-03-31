import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Load form data by slug
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Slug obrigatório" }, { status: 400 });

  // Get pipe by slug
  const { data: pipe, error: pipeErr } = await supabase
    .from("bpm_pipes")
    .select("id, name, icon, color, org_id, public_form_enabled, form_access_type, public_form_fields")
    .eq("public_form_slug", slug)
    .single();

  if (pipeErr || !pipe) {
    return NextResponse.json({ error: "Formulário não encontrado" }, { status: 404 });
  }

  if (!pipe.public_form_enabled) {
    return NextResponse.json({ error: "Formulário não está ativo" }, { status: 403 });
  }

  // Get start phase
  const { data: phases } = await supabase
    .from("bpm_phases")
    .select("id, name, is_start, default_assignee_id, sla_hours")
    .eq("pipe_id", pipe.id)
    .order("position");

  const startPhase = phases?.find((p) => p.is_start) || phases?.[0];
  if (!startPhase) {
    return NextResponse.json({ error: "Processo sem fases configuradas" }, { status: 400 });
  }

  // Get fields for start phase
  const { data: fields } = await supabase
    .from("bpm_fields")
    .select("id, field_key, field_type, label, placeholder, help_text, is_required, options, default_value, position")
    .eq("phase_id", startPhase.id)
    .order("position");

  // Get org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", pipe.org_id)
    .single();

  // Filter fields by public_form_fields if configured
  let visibleFields = fields || [];
  const publicFieldIds: string[] = (pipe as any).public_form_fields || [];
  if (publicFieldIds.length > 0) {
    visibleFields = visibleFields.filter((f: any) => publicFieldIds.includes(f.id) || f.is_required);
  }

  return NextResponse.json({
    pipe: { id: pipe.id, name: pipe.name, icon: pipe.icon, color: pipe.color },
    orgId: pipe.org_id,
    orgName: org?.name || "",
    startPhase: { id: startPhase.id, name: startPhase.name, default_assignee_id: startPhase.default_assignee_id, sla_hours: startPhase.sla_hours },
    fields: visibleFields,
  });
}

// POST: Submit public form (create card + values)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, title, values } = body as {
    slug: string;
    title: string;
    values: Record<string, any>;
  };

  if (!slug || !title?.trim()) {
    return NextResponse.json({ error: "Slug e título obrigatórios" }, { status: 400 });
  }

  // Get pipe
  const { data: pipe } = await supabase
    .from("bpm_pipes")
    .select("id, org_id, public_form_enabled")
    .eq("public_form_slug", slug)
    .single();

  if (!pipe || !pipe.public_form_enabled) {
    return NextResponse.json({ error: "Formulário não disponível" }, { status: 403 });
  }

  // Get start phase
  const { data: phases } = await supabase
    .from("bpm_phases")
    .select("id, is_start, default_assignee_id, sla_hours")
    .eq("pipe_id", pipe.id)
    .order("position");

  const startPhase = phases?.find((p) => p.is_start) || phases?.[0];
  if (!startPhase) {
    return NextResponse.json({ error: "Sem fase inicial" }, { status: 400 });
  }

  const slaDeadline = startPhase.sla_hours
    ? new Date(Date.now() + startPhase.sla_hours * 3600000).toISOString()
    : null;

  // Create card
  const { data: card, error: cardErr } = await supabase
    .from("bpm_cards")
    .insert({
      pipe_id: pipe.id,
      org_id: pipe.org_id,
      current_phase_id: startPhase.id,
      title: title.trim(),
      assignee_id: startPhase.default_assignee_id || null,
      sla_deadline: slaDeadline,
      priority: "medium",
    })
    .select()
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Erro ao criar card: " + cardErr?.message }, { status: 500 });
  }

  // Insert card values
  if (values && Object.keys(values).length > 0) {
    const rows = Object.entries(values).map(([fieldId, value]) => ({
      card_id: card.id,
      field_id: fieldId,
      value,
    }));

    await supabase.from("bpm_card_values").insert(rows);
  }

  // Insert history
  await supabase.from("bpm_card_history").insert({
    card_id: card.id,
    to_phase_id: startPhase.id,
    action: "created",
  });

  return NextResponse.json({ success: true, cardId: card.id });
}
