import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET /api/goals?org_id=xxx&type=budget|member&year=2026
 */
export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const type = searchParams.get("type") || "budget";

    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    // Check if user is admin/owner
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    const isAdmin = membership?.role === "owner" || membership?.role === "admin";

    if (type === "member") {
      let q = admin
        .from("member_goals")
        .select("*")
        .eq("org_id", orgId);

      // Non-admins only see their own goals
      if (!isAdmin) {
        q = q.eq("user_id", user.id);
      }

      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch profiles for all user_ids
      const userIds = [...new Set((data || []).map((g: any) => g.user_id))];
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      const enriched = (data || []).map((g: any) => ({
        ...g,
        profile: profileMap[g.user_id] || null,
      }));

      return NextResponse.json(enriched);
    }

    // Budget goals
    let q = admin
      .from("budget_goals")
      .select("*, department:department_id(id, descricao), category:category_id(id, codigo, descricao, tipo)")
      .eq("org_id", orgId);

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Non-admins: filter to only goals where they are in allowed_viewers
    let filtered = data || [];
    if (!isAdmin) {
      filtered = filtered.filter((g: any) => {
        const viewers: string[] = g.allowed_viewers || [];
        return viewers.includes(user.id);
      });
    }

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/goals
 * Body: { type: "budget"|"member", ...fields }
 */
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json();
    const { type, ...fields } = body;

    if (type === "member") {
      const { data, error } = await admin.from("member_goals").insert({
        ...fields,
        created_by: user.id,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // Budget goal
    const { data, error } = await admin.from("budget_goals").insert({
      ...fields,
      created_by: user.id,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/goals
 * Body: { id, type, ...updates }
 */
export async function PATCH(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json();
    const { id, type, ...updates } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const table = type === "member" ? "member_goals" : "budget_goals";
    const { data, error } = await admin.from(table).update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/goals?id=xxx&type=budget|member
 */
export async function DELETE(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "budget";

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const table = type === "member" ? "member_goals" : "budget_goals";
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/goals/members?org_id=xxx
 * Returns org members with profiles (for dropdown)
 */
