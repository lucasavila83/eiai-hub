import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET /api/goals/members?org_id=xxx
 * Returns org members with profiles. Caller must be a member of the org.
 */
export async function GET(req: NextRequest) {
  try {
    // SECURITY: returns the entire org's member list (full names, emails,
    // avatars). Without auth + membership check, any unauthenticated
    // visitor could enumerate every user of every org. Authenticate
    // first, then verify membership.
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const admin = createAdminClient();
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Sem acesso a esta organização" }, { status: 403 });
    }

    const { data } = await admin
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, email, avatar_url)")
      .eq("org_id", orgId);

    const members = (data || []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: m.profiles?.full_name || null,
      email: m.profiles?.email || "",
      avatar_url: m.profiles?.avatar_url || null,
    }));

    return NextResponse.json(members);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
