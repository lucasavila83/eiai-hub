import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ token: null });
  }

  // Check for pending (not accepted) invite
  const { data: pending } = await adminClient
    .from("invitations")
    .select("token")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (pending) {
    return NextResponse.json({ token: pending.token });
  }

  // Check for any invite (even accepted) — user might need to be re-added
  const { data: any_invite } = await adminClient
    .from("invitations")
    .select("token")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (any_invite) {
    return NextResponse.json({ token: any_invite.token });
  }

  return NextResponse.json({ token: null });
}
