import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/goals/members?org_id=xxx
 * Returns org members with profiles
 */
export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

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
