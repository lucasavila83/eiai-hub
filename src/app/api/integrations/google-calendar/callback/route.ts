import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getOAuth2Client } from "@/lib/google/calendar";

/**
 * GET /api/integrations/google-calendar/callback
 * OAuth2 callback from Google. Exchanges code for tokens and stores them.
 */
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/integrations?gcal_error=denied", req.url));
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(new URL("/integrations?gcal_error=missing_params", req.url));
    }

    // Decode state
    let state: { userId: string; orgId: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64").toString());
    } catch {
      return NextResponse.redirect(new URL("/integrations?gcal_error=invalid_state", req.url));
    }

    // Exchange code for tokens
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(new URL("/integrations?gcal_error=no_tokens", req.url));
    }

    // Use admin client to bypass RLS (callback has no user session)
    const supabase = createAdminClient();

    // Upsert token record
    await supabase.from("google_calendar_tokens").upsert(
      {
        org_id: state.orgId,
        user_id: state.userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(tokens.expiry_date!).toISOString(),
        calendar_id: "primary",
      },
      { onConflict: "org_id,user_id" }
    );

    return NextResponse.redirect(new URL("/integrations?gcal_success=true", req.url));
  } catch (err: any) {
    console.error("Google Calendar callback error:", err);
    return NextResponse.redirect(new URL("/integrations?gcal_error=server", req.url));
  }
}
