import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET /api/goals?org_id=xxx&type=budget|member&year_month=2026-03
 */
export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const type = searchParams.get("type") || "budget";
    const yearMonth = searchParams.get("year_month");

    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    if (type === "member") {
      let q = admin
        .from("member_goals")
        .select("*, profiles:user_id(full_name, email, avatar_url)")
        .eq("org_id", orgId);
      if (yearMonth) q = q.eq("year_month", yearMonth);
      const { data, error } = await q.order("year_month", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }

    // Default: budget goals
    let q = admin
      .from("budget_goals")
      .select("*, department:department_id(id, descricao), category:category_id(id, codigo, descricao, tipo)")
      .eq("org_id", orgId);
    if (yearMonth) q = q.eq("year_month", yearMonth);
    const { data, error } = await q.order("year_month", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
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
      const { data, error } = await admin.from("member_goals").upsert({
        ...fields,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,user_id,goal_type,goal_name,year_month" }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // Budget goal
    const { data, error } = await admin.from("budget_goals").upsert({
      ...fields,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id,department_id,category_id,year_month" }).select().single();
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
