import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/integrations/google-calendar/boards?orgId=...
 * Returns synced_board_ids for the current user.
 *
 * PUT /api/integrations/google-calendar/boards
 * Body: { orgId, boardIds: string[] }
 * Updates which boards to sync.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("synced_board_ids")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ boardIds: data?.synced_board_ids || [] });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, boardIds } = await req.json();
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const { error } = await supabase
    .from("google_calendar_tokens")
    .update({ synced_board_ids: boardIds || [] })
    .eq("org_id", orgId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
