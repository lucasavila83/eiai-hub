import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/";

  const supabase = await createClient();

  // Handle PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // For password recovery, redirect to reset page
      if (type === "recovery" || next === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Handle token_hash flow (email links like recovery, invite, signup)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    });
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      if (type === "invite" || type === "signup") {
        return NextResponse.redirect(`${origin}/`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If no code/token or exchange failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login`);
}
