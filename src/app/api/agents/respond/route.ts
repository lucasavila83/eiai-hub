import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const PERSONALITY_RESPONSES: Record<string, (topic: string) => string> = {
  helpful: (topic) => `Posso ajudar com isso! ${topic}`,
  formal: (topic) => `Prezado(a), segue a orientação sobre o assunto. ${topic}`,
  friendly: (topic) => `Opa! Claro, vamos lá! 😊 ${topic}`,
  technical: (topic) => `Análise técnica: ${topic}`,
  creative: (topic) => `Que tal uma abordagem diferente? 💡 ${topic}`,
};

function generateResponse(
  messageContent: string,
  personality: string = "helpful",
  instructions: string | null = null
): string {
  const lower = messageContent.toLowerCase();
  const prefix = PERSONALITY_RESPONSES[personality] || PERSONALITY_RESPONSES.helpful;

  // Check for specific topics
  if (lower.includes("tarefa") || lower.includes("task") || lower.includes("criar")) {
    return prefix(
      "Para gerenciar tarefas:\n" +
      "• Use `/tarefa [título]` no chat para criar rapidamente\n" +
      "• Atribua responsáveis com `@usuário`\n" +
      "• Defina prioridade (urgente, alta, média, baixa)\n" +
      "• Adicione subtarefas para dividir o trabalho\n" +
      "• Acompanhe prazos no calendário"
    );
  }

  if (lower.includes("ajuda") || lower.includes("help") || lower.includes("como")) {
    return prefix(
      "Aqui estão os comandos e recursos disponíveis:\n" +
      "• `/tarefa [título]` — Criar nova tarefa\n" +
      "• `@usuário` — Mencionar alguém\n" +
      "• Boards — Gerencie projetos com Kanban\n" +
      "• Calendário — Visualize eventos e prazos\n" +
      "• Dashboard — Métricas e relatórios\n" +
      "• Automações — Regras automáticas para tarefas"
    );
  }

  if (lower.includes("board") || lower.includes("kanban") || lower.includes("projeto")) {
    return prefix(
      "Dicas sobre Boards e Kanban:\n" +
      "• Arraste cards entre colunas para atualizar status\n" +
      "• Configure limites WIP nas colunas\n" +
      "• Use labels e cores para categorizar\n" +
      "• Adicione subtarefas para dividir entregas\n" +
      "• Configure automações (ex: mover → marcar concluído)"
    );
  }

  if (lower.includes("reunião") || lower.includes("meeting") || lower.includes("evento") || lower.includes("agenda")) {
    return prefix(
      "Para agendar reuniões e eventos:\n" +
      "• Acesse o Calendário na barra lateral\n" +
      "• Clique no dia para criar um evento\n" +
      "• Defina horário, local e descrição\n" +
      "• Prazos de tarefas aparecem automaticamente no calendário"
    );
  }

  if (lower.includes("relatorio") || lower.includes("relatório") || lower.includes("dashboard") || lower.includes("metrica")) {
    return prefix(
      "Para visualizar métricas:\n" +
      "• Acesse o Dashboard na barra lateral\n" +
      "• Veja KPIs: tarefas, conclusão, atrasos\n" +
      "• Gráfico de atividade dos últimos 7 dias\n" +
      "• Distribuição por prioridade\n" +
      "• Progresso de cada board"
    );
  }

  if (lower.includes("integra") || lower.includes("webhook") || lower.includes("slack") || lower.includes("github")) {
    return prefix(
      "Integrações disponíveis:\n" +
      "• Webhook — Envie dados para qualquer URL\n" +
      "• Slack — Notificações via Incoming Webhook\n" +
      "• GitHub — Vincule repos e commits\n" +
      "• Email — Notificações por email\n" +
      "• Google Calendar — Sincronize eventos\n" +
      "Acesse Integrações na barra lateral para configurar."
    );
  }

  // Custom instructions response
  if (instructions) {
    return prefix(
      `Baseado nas minhas instruções: ${instructions.slice(0, 200)}\n\n` +
      "Posso ajudar com tarefas, boards, calendário, automações e muito mais. " +
      "Diga o que precisa!"
    );
  }

  // Generic response
  return prefix(
    "Estou aqui para ajudar! Posso auxiliar com:\n" +
    "• Gestão de tarefas e projetos\n" +
    "• Organização de boards Kanban\n" +
    "• Agendamento no calendário\n" +
    "• Automações e integrações\n" +
    "• Métricas e relatórios\n\n" +
    "O que você precisa?"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const channelId = body.channelId ?? body.channel_id;
  const messageContent = body.messageContent ?? body.content;
  const agentId = body.agentId ?? body.agent_id;
  const personality = body.personality ?? "helpful";
  const instructions = body.instructions ?? null;
  const testMode = body.testMode ?? false;

  if (!messageContent) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const responseContent = generateResponse(messageContent, personality, instructions);

  // In test mode, just return the response without posting
  if (testMode) {
    return NextResponse.json({ success: true, response: responseContent });
  }

  if (!channelId || !agentId) {
    return NextResponse.json({ error: "Missing channelId or agentId" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: agentId,
    content: responseContent,
    mentions: [],
    metadata: { is_agent_response: true, personality },
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: data, response: responseContent });
}
