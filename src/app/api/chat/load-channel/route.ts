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

    const { channelId, before } = await req.json();

    // If `before` cursor is provided, this is a pagination request (load older messages)
    if (before) {
      // Just check membership exists (lightweight)
      const { data: mem } = await adminClient
        .from("channel_members")
        .select("id")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .single();

      if (!mem) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }

      const { data: olderMsgs } = await adminClient
        .from("messages")
        .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(30);

      const messages = (olderMsgs || []).reverse();
      return NextResponse.json({ messages, hasMore: messages.length >= 30 });
    }

    // Initial load — run all independent queries in parallel
    const [channelRes, membershipRes, messagesRes] = await Promise.all([
      adminClient
        .from("channels")
        .select("*")
        .eq("id", channelId)
        .single(),
      adminClient
        .from("channel_members")
        .select("id")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .single(),
      adminClient
        .from("messages")
        .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const channel = channelRes.data;
    const membership = membershipRes.data;

    if (!channel) {
      return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
    }

    // Validate user belongs to the channel's org
    const { data: orgMembership } = await adminClient
      .from("org_members")
      .select("id")
      .eq("org_id", channel.org_id)
      .eq("user_id", userId)
      .single();

    if (!orgMembership) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
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

    // Messages were fetched in descending order for limit — reverse to ascending for display
    const messages = (messagesRes.data || []).reverse();
    const hasMore = messages.length >= 30;

    // For DM channels, resolve the correct display name (other user's name)
    if (channel.type === "dm") {
      const { data: members } = await adminClient
        .from("channel_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("channel_id", channelId);
      if (members) {
        const otherMember = members.find((m: any) => m.user_id !== userId);
        if (otherMember?.profiles) {
          channel.dm_other_user = otherMember.profiles;
        }
      }
    }

    return NextResponse.json({ channel, messages, hasMore });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
