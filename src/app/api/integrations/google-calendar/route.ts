import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUrl } from "@/lib/google/calendar";

/**
 * GET /api/integrations/google-calendar
 * Returns the OAuth URL to connect Google Calendar.
 * Query: ?orgId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // Check existing connection
    const { data: existing } = await supabase
      .from("google_calendar_tokens")
      .select("id, calendar_id, updated_at")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ connected: true, calendar_id: existing.calendar_id, updated_at: existing.updated_at });
    }

    // State encodes user + org for callback
    const state = Buffer.from(JSON.stringify({ userId: user.id, orgId })).toString("base64");
    const url = getAuthUrl(state);

    return NextResponse.json({ connected: false, auth_url: url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
