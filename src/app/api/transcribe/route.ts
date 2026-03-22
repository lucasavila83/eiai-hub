import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get("audio") as File;

  if (!audioFile) {
    return NextResponse.json({ error: "Nenhum arquivo de áudio" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key não configurada" }, { status: 500 });
  }

  try {
    // Send to OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "pt");
    whisperForm.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Whisper error:", err);
      return NextResponse.json({ error: "Erro na transcrição" }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json({ text: result.text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json({ error: err.message || "Erro na transcrição" }, { status: 500 });
  }
}
