import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { message, cardTitle, cardDescription, subtasks } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key não configurada" }, { status: 500 });
  }

  const systemPrompt = `Você é um assistente de produtividade integrado a um sistema de gestão de tarefas.
Seu papel é ajudar o usuário a organizar e planejar suas tarefas de forma eficiente.

Contexto da tarefa atual:
- Título: ${cardTitle || "Sem título"}
${cardDescription ? `- Descrição: ${cardDescription}` : ""}
${subtasks?.length > 0 ? `- Subtarefas: ${subtasks.map((s: any) => `${s.is_completed ? "✅" : "⬜"} ${s.title}`).join(", ")}` : ""}

Diretrizes:
- Responda sempre em português brasileiro
- Seja conciso e direto
- Sugira subtarefas, prazos, prioridades quando relevante
- Use markdown para formatar (negrito, listas, etc.)
- Se pedirem para organizar, sugira um plano de ação estruturado
- Se pedirem dicas, dê sugestões práticas baseadas no contexto da tarefa`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", err);
      return NextResponse.json({ error: "Erro na IA" }, { status: 500 });
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content || "Sem resposta";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("AI assist error:", err);
    return NextResponse.json({ error: err.message || "Erro na IA" }, { status: 500 });
  }
}
