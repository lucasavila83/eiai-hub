import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Authenticate
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

    const { query, orgId } = await req.json();

    if (!query?.trim() || query.trim().length < 2 || !orgId) {
      return NextResponse.json({ exact: [], approximate: [] });
    }

    const searchTerm = query.trim();

    // Get channels this user belongs to (in the org)
    const { data: userChannels } = await adminClient
      .from("channel_members")
      .select("channel_id, channels!inner(id, org_id)")
      .eq("user_id", userId)
      .eq("channels.org_id", orgId);

    if (!userChannels || userChannels.length === 0) {
      return NextResponse.json({ exact: [], approximate: [] });
    }

    const channelIds = userChannels.map((uc: any) => uc.channel_id);

    // EXACT search: case-insensitive ILIKE for the exact term
    const { data: exactResults } = await adminClient
      .from("messages")
      .select("id, content, channel_id, created_at, user_id, profiles:user_id(full_name, email)")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .ilike("content", `%${searchTerm}%`)
      .order("created_at", { ascending: false })
      .limit(10);

    // APPROXIMATE search: split words and search for each
    // Only if the term has 3+ chars, search for partial matches
    let approxResults: any[] = [];
    if (searchTerm.length >= 3) {
      // Search with trigram-like approach: first 3 chars
      const partialTerm = searchTerm.length > 4 ? searchTerm.slice(0, Math.ceil(searchTerm.length * 0.7)) : searchTerm;

      const { data: fuzzyResults } = await adminClient
        .from("messages")
        .select("id, content, channel_id, created_at, user_id, profiles:user_id(full_name, email)")
        .in("channel_id", channelIds)
        .is("deleted_at", null)
        .ilike("content", `%${partialTerm}%`)
        .order("created_at", { ascending: false })
        .limit(15);

      // Filter out results already in exact
      const exactIds = new Set((exactResults || []).map((r: any) => r.id));
      approxResults = (fuzzyResults || []).filter((r: any) => !exactIds.has(r.id));
    }

    // Format results
    const formatResult = (msg: any, matchType: string) => ({
      id: msg.id,
      content: msg.content,
      channel_id: msg.channel_id,
      created_at: msg.created_at,
      sender_name: msg.profiles?.full_name || msg.profiles?.email || "Usuário",
      match_type: matchType,
    });

    return NextResponse.json({
      exact: (exactResults || []).map((m: any) => formatResult(m, "exact")),
      approximate: approxResults.slice(0, 5).map((m: any) => formatResult(m, "approximate")),
    });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json({ exact: [], approximate: [] }, { status: 200 });
  }
}
