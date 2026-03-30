import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/integrations/google-calendar/disconnect
 * Removes Google Calendar tokens for the current user.
 * Body: { orgId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await req.json();

    await supabase
      .from("google_calendar_tokens")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", user.id);

    return NextResponse.json({ disconnected: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
