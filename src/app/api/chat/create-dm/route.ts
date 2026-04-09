import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Verify auth
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

    const { orgId, targetUserId, dmName } = await req.json();

    // Verify both users are org members
    const { data: callerMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .single();

    if (!callerMember) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { data: targetMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Check if DM already exists between these two users IN THIS ORG
    const { data: userChannels } = await adminClient
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId);

    if (userChannels && userChannels.length > 0) {
      const channelIds = userChannels.map((c: any) => c.channel_id);
      const { data: shared } = await adminClient
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", targetUserId)
        .in("channel_id", channelIds);

      if (shared && shared.length > 0) {
        const { data: existingDM } = await adminClient
          .from("channels")
          .select("*")
          .eq("type", "dm")
          .eq("org_id", orgId)
          .in("id", shared.map((s: any) => s.channel_id))
          .limit(1);

        if (existingDM && existingDM.length > 0) {
          const dm = existingDM[0];
          // Un-hide for the CURRENT user only (per-user visibility)
          await adminClient
            .from("channel_members")
            .update({ is_hidden: false })
            .eq("channel_id", dm.id)
            .eq("user_id", userId);
          // Override name with the target user's name (from caller's perspective)
          dm.name = dmName;
          return NextResponse.json({ channel: dm });
        }
      }
    }

    // Create DM channel
    const { data: channel, error: createError } = await adminClient
      .from("channels")
      .insert({
        org_id: orgId,
        name: dmName,
        type: "dm",
        created_by: userId,
        is_archived: false,
      })
      .select()
      .single();

    if (createError || !channel) {
      return NextResponse.json({ error: createError?.message || "Erro ao criar canal" }, { status: 500 });
    }

    // Add both users as channel members
    const now = new Date().toISOString();
    await adminClient.from("channel_members").insert([
      { channel_id: channel.id, user_id: userId, last_read_at: now, notifications: "all" },
      { channel_id: channel.id, user_id: targetUserId, last_read_at: now, notifications: "all" },
    ]);

    return NextResponse.json({ channel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
