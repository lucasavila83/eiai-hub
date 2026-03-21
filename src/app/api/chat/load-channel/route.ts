import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    let userId = user?.id;
    if (!userId) {
      const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
      if (authHeader) {
        const { data } = await adminClient.auth.getUser(authHeader);
        userId = data.user?.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { channelId } = await req.json();

    // Check membership
    const { data: membership } = await adminClient
      .from("channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .single();

    // Load channel info (using admin to bypass RLS)
    const { data: channel } = await adminClient
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .single();

    if (!channel) {
      return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
    }

    // For public channels, auto-join if not member
    if (!membership && channel.type === "public") {
      await adminClient.from("channel_members").insert({
        channel_id: channelId,
        user_id: userId,
        last_read_at: new Date().toISOString(),
        notifications: "all",
      });
    } else if (!membership) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Load messages (using admin to bypass RLS)
    const { data: messages } = await adminClient
      .from("messages")
      .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    return NextResponse.json({ channel, messages: messages || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
