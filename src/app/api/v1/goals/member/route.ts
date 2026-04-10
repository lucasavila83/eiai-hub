import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:goals");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const yearMonth = searchParams.get("year_month");

  let query = admin
    .from("member_goals")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("year_month", { ascending: false });

  if (userId) query = query.eq("user_id", userId);
  if (yearMonth) query = query.eq("year_month", yearMonth);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:goals");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { user_id, goal_type, goal_name, target_value, year_month, current_value = 0 } = body;

  if (!user_id || !goal_type || !goal_name || typeof target_value !== "number" || !year_month) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "user_id, goal_type, goal_name, target_value, year_month are required.", 400);
  }
  if (!["tasks_completed", "sla_met", "avg_time", "custom"].includes(goal_type)) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "invalid goal_type.", 400);
  }

  const { data, error } = await admin
    .from("member_goals")
    .upsert(
      {
        org_id: auth.orgId,
        user_id,
        goal_type,
        goal_name,
        target_value,
        current_value,
        year_month,
        created_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,user_id,goal_type,goal_name,year_month" }
    )
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
