import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function generateResponse(messageContent: string): string {
  const lower = messageContent.toLowerCase();

  if (lower.includes("tarefa") || lower.includes("task")) {
    return (
      "Dicas para criar tarefas:\n" +
      "- Use `/tarefa` seguido do titulo para criar rapidamente\n" +
      "- Atribua responsaveis com `@usuario`\n" +
      "- Defina prioridade (urgente, alta, media, baixa)\n" +
      "- Adicione uma data limite para acompanhar prazos"
    );
  }

  if (lower.includes("ajuda") || lower.includes("help")) {
    return (
      "Comandos disponiveis:\n" +
      "- `/tarefa [titulo]` - Criar nova tarefa\n" +
      "- `@usuario` - Mencionar alguem\n" +
      "- `/board [nome]` - Abrir um board\n" +
      "- `/ajuda` - Ver esta lista de comandos"
    );
  }

  if (lower.includes("board") || lower.includes("kanban")) {
    return (
      "Dicas sobre boards:\n" +
      "- Arraste cards entre colunas para mudar o status\n" +
      "- Configure limites WIP nas colunas para controlar o fluxo\n" +
      "- Use labels e prioridades para organizar visualmente\n" +
      "- Clique no card para ver detalhes, comentarios e historico"
    );
  }

  return "Entendi! Posso ajudar com tarefas (/tarefa), mencoes (@usuario), ou boards. Como posso ajudar?";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const channelId = body.channelId ?? body.channel_id;
  const messageContent = body.messageContent ?? body.content;
  const agentId = body.agentId ?? body.agent_id;

  if (!channelId || !messageContent || !agentId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createClient();

  const responseContent = generateResponse(messageContent);

  const { data, error } = await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: agentId,
    content: responseContent,
    mentions: [],
    metadata: { is_agent_response: true },
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: data, response: responseContent });
}
