import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/bpm/seed
 * Cria o processo "Contratação de Funcionário" com fases, campos e automações.
 * Body: { orgId }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });

    // Verify admin
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Check if already exists
    const { data: existing } = await adminClient
      .from("bpm_pipes")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", "Contratação de Funcionário")
      .eq("is_archived", false)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Processo 'Contratação de Funcionário' já existe", pipe_id: existing.id }, { status: 409 });
    }

    // ===== CREATE PIPE =====
    const { data: pipe } = await adminClient
      .from("bpm_pipes")
      .insert({
        org_id: orgId,
        name: "Contratação de Funcionário",
        description: "Processo completo de contratação: desde a coleta de informações até o onboarding do novo colaborador.",
        icon: "user-plus",
        color: "#22c55e",
        created_by: user.id,
      })
      .select()
      .single();

    if (!pipe) return NextResponse.json({ error: "Erro ao criar pipe" }, { status: 500 });

    // ===== CREATE PHASES =====
    const phasesData = [
      { name: "Contratação", description: "Aqui você colocará todas as informações necessárias para seguir o processo!", position: 0, is_start: true, is_end: false, color: "#3b82f6", sla_hours: 48 },
      { name: "Documentação", description: "Hora de juntar toda a documentação necessária.", position: 1, is_start: false, is_end: false, color: "#6366f1", sla_hours: 72 },
      { name: "Contratos", description: "Hora de formalizar a relação!", position: 2, is_start: false, is_end: false, color: "#8b5cf6", sla_hours: 48 },
      { name: "Preparação", description: "Preparar tudo o que é necessário para o trabalho do Colaborador.", position: 3, is_start: false, is_end: false, color: "#f97316", sla_hours: 48 },
      { name: "Onboarding", description: "Momento de fazer o novo membro do time se sentir em casa! Ensine os procedimentos padrão, não se esqueça de nada!", position: 4, is_start: false, is_end: false, color: "#22c55e", sla_hours: 72 },
      { name: "Ativo", description: "Colaborador ativo na empresa.", position: 5, is_start: false, is_end: true, color: "#14b8a6", sla_hours: null },
      { name: "Desligados", description: "Contratações antigas, arquivadas, encerradas.", position: 6, is_start: false, is_end: false, color: "#94a3b8", sla_hours: null },
    ];

    const { data: phases } = await adminClient
      .from("bpm_phases")
      .insert(phasesData.map((p) => ({ ...p, pipe_id: pipe.id })))
      .select();

    if (!phases) return NextResponse.json({ error: "Erro ao criar fases" }, { status: 500 });

    // Phase map for easy access
    const phaseMap: Record<string, string> = {};
    for (const p of phases) {
      phaseMap[p.name] = p.id;
    }

    // ===== CREATE FIELDS =====
    const fieldsData = [
      // Fase: Contratação
      { phase_id: phaseMap["Contratação"], field_key: "nome_completo", field_type: "text", label: "Nome completo", is_required: true, position: 0 },
      { phase_id: phaseMap["Contratação"], field_key: "email_funcionario", field_type: "email", label: "E-mail do Funcionário", placeholder: "email@exemplo.com", is_required: true, position: 1 },
      { phase_id: phaseMap["Contratação"], field_key: "telefone", field_type: "phone", label: "Número de Telefone", placeholder: "+55 47 99999-0000", is_required: true, position: 2 },
      { phase_id: phaseMap["Contratação"], field_key: "cargo", field_type: "text", label: "Cargo", placeholder: "Ex: Analista Financeiro", is_required: true, position: 3 },
      { phase_id: phaseMap["Contratação"], field_key: "departamento", field_type: "select", label: "Departamento", is_required: false, position: 4, options: [
        { value: "financeiro", label: "Financeiro" },
        { value: "comercial", label: "Comercial" },
        { value: "marketing", label: "Marketing" },
        { value: "administrativo", label: "Administrativo" },
        { value: "ti", label: "TI" },
        { value: "rh", label: "RH" },
        { value: "operacional", label: "Operacional" },
      ]},
      { phase_id: phaseMap["Contratação"], field_key: "data_admissao", field_type: "date", label: "Data de Admissão", is_required: false, position: 5 },
      { phase_id: phaseMap["Contratação"], field_key: "salario", field_type: "currency", label: "Salário", is_required: false, position: 6 },
      { phase_id: phaseMap["Contratação"], field_key: "observacoes", field_type: "textarea", label: "Observações", placeholder: "Informações adicionais...", is_required: false, position: 7 },

      // Fase: Documentação
      { phase_id: phaseMap["Documentação"], field_key: "cpf", field_type: "text", label: "CPF", is_required: true, position: 0 },
      { phase_id: phaseMap["Documentação"], field_key: "rg", field_type: "text", label: "RG", is_required: true, position: 1 },
      { phase_id: phaseMap["Documentação"], field_key: "endereco", field_type: "textarea", label: "Endereço completo", is_required: true, position: 2 },
      { phase_id: phaseMap["Documentação"], field_key: "comprovante_residencia", field_type: "file", label: "Comprovante de Residência", is_required: true, position: 3 },
      { phase_id: phaseMap["Documentação"], field_key: "foto_documento", field_type: "file", label: "Foto do Documento (RG/CNH)", is_required: true, position: 4 },
      { phase_id: phaseMap["Documentação"], field_key: "certidao_nascimento", field_type: "file", label: "Certidão de Nascimento/Casamento", is_required: false, position: 5 },
      { phase_id: phaseMap["Documentação"], field_key: "titulo_eleitor", field_type: "file", label: "Título de Eleitor", is_required: false, position: 6 },
      { phase_id: phaseMap["Documentação"], field_key: "carteira_trabalho", field_type: "file", label: "Carteira de Trabalho (CTPS)", is_required: true, position: 7 },
      { phase_id: phaseMap["Documentação"], field_key: "pis_pasep", field_type: "text", label: "PIS/PASEP", is_required: false, position: 8 },
      { phase_id: phaseMap["Documentação"], field_key: "dados_bancarios", field_type: "textarea", label: "Dados Bancários (banco, agência, conta)", is_required: false, position: 9 },

      // Fase: Contratos
      { phase_id: phaseMap["Contratos"], field_key: "tipo_contrato", field_type: "select", label: "Tipo de Contrato", is_required: true, position: 0, options: [
        { value: "clt", label: "CLT" },
        { value: "pj", label: "PJ" },
        { value: "estagio", label: "Estágio" },
        { value: "temporario", label: "Temporário" },
      ]},
      { phase_id: phaseMap["Contratos"], field_key: "contrato_assinado", field_type: "file", label: "Contrato Assinado", is_required: true, position: 1 },
      { phase_id: phaseMap["Contratos"], field_key: "data_assinatura", field_type: "date", label: "Data de Assinatura", is_required: true, position: 2 },
      { phase_id: phaseMap["Contratos"], field_key: "periodo_experiencia", field_type: "select", label: "Período de Experiência", is_required: false, position: 3, options: [
        { value: "30", label: "30 dias" },
        { value: "45", label: "45 dias" },
        { value: "60", label: "60 dias" },
        { value: "90", label: "90 dias" },
        { value: "na", label: "Não se aplica" },
      ]},

      // Fase: Preparação
      { phase_id: phaseMap["Preparação"], field_key: "email_corporativo_criado", field_type: "checkbox", label: "E-mail corporativo criado", is_required: true, position: 0 },
      { phase_id: phaseMap["Preparação"], field_key: "acessos_sistemas", field_type: "checkbox", label: "Acessos aos sistemas configurados", is_required: true, position: 1 },
      { phase_id: phaseMap["Preparação"], field_key: "equipamentos", field_type: "textarea", label: "Equipamentos entregues", placeholder: "Notebook, mouse, headset...", is_required: false, position: 2 },
      { phase_id: phaseMap["Preparação"], field_key: "mesa_lugar", field_type: "checkbox", label: "Mesa/lugar de trabalho preparado", is_required: false, position: 3 },
      { phase_id: phaseMap["Preparação"], field_key: "responsavel_preparacao", field_type: "user", label: "Responsável pela preparação", is_required: false, position: 4 },

      // Fase: Onboarding
      { phase_id: phaseMap["Onboarding"], field_key: "apresentacao_equipe", field_type: "checkbox", label: "Apresentação para a equipe realizada", is_required: true, position: 0 },
      { phase_id: phaseMap["Onboarding"], field_key: "treinamento_sistemas", field_type: "checkbox", label: "Treinamento dos sistemas realizado", is_required: true, position: 1 },
      { phase_id: phaseMap["Onboarding"], field_key: "procedimentos_entregues", field_type: "checkbox", label: "Procedimentos e manuais entregues", is_required: true, position: 2 },
      { phase_id: phaseMap["Onboarding"], field_key: "mentor_designado", field_type: "user", label: "Mentor/Buddy designado", is_required: false, position: 3 },
      { phase_id: phaseMap["Onboarding"], field_key: "feedback_primeiro_dia", field_type: "textarea", label: "Feedback do primeiro dia", is_required: false, position: 4 },
    ];

    await adminClient.from("bpm_fields").insert(fieldsData.map((f) => ({
      ...f,
      options: (f as any).options || [],
      placeholder: (f as any).placeholder || null,
      help_text: null,
      default_value: null,
      validations: {},
    })));

    // ===== CREATE AUTOMATIONS =====
    const automationsData = [
      {
        pipe_id: pipe.id,
        phase_id: phaseMap["Documentação"],
        name: "Notificar responsável da documentação",
        trigger_type: "card_moved_to_phase",
        action_type: "notify_chat",
        config: { title: "Nova contratação - Documentação", message: "Um novo colaborador precisa de documentação. Verifique o card." },
      },
      {
        pipe_id: pipe.id,
        phase_id: phaseMap["Contratos"],
        name: "Notificar sobre contratos",
        trigger_type: "card_moved_to_phase",
        action_type: "notify_chat",
        config: { title: "Contratação - Fase de Contratos", message: "Documentação concluída. Hora de preparar os contratos." },
      },
      {
        pipe_id: pipe.id,
        phase_id: phaseMap["Preparação"],
        name: "Notificar TI para preparar acessos",
        trigger_type: "card_moved_to_phase",
        action_type: "notify_chat",
        config: { title: "Novo colaborador - Preparar acessos", message: "Preparar e-mail, acessos e equipamentos para o novo colaborador." },
      },
      {
        pipe_id: pipe.id,
        phase_id: phaseMap["Onboarding"],
        name: "Notificar sobre onboarding",
        trigger_type: "card_moved_to_phase",
        action_type: "notify_chat",
        config: { title: "Onboarding iniciado", message: "O novo colaborador está pronto para o onboarding. Agende as apresentações." },
      },
      {
        pipe_id: pipe.id,
        phase_id: null,
        name: "Alerta SLA prestes a vencer",
        trigger_type: "sla_warning",
        action_type: "notify_chat",
        config: { title: "SLA prestes a vencer", message: "Uma etapa de contratação está próxima do prazo. Verifique!" },
      },
      {
        pipe_id: pipe.id,
        phase_id: null,
        name: "Alerta SLA vencido",
        trigger_type: "sla_expired",
        action_type: "notify_chat",
        config: { title: "SLA vencido!", message: "O prazo de uma etapa de contratação venceu. Ação urgente necessária." },
      },
    ];

    await adminClient.from("bpm_automations").insert(automationsData.map((a) => ({
      ...a,
      is_active: true,
    })));

    return NextResponse.json({
      message: "Processo 'Contratação de Funcionário' criado com sucesso!",
      pipe_id: pipe.id,
      phases: phases.length,
      fields: fieldsData.length,
      automations: automationsData.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
