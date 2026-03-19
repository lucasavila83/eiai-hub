import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { channel_id, content, agent_id } = await req.json();

  if (!channel_id || !content || !agent_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("messages").insert({
    channel_id,
    user_id: agent_id,
    content,
    mentions: [],
    metadata: { is_agent_response: true },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
