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
  const yearMonth = searchParams.get("year_month");
  const departmentId = searchParams.get("department_id");

  let query = admin
    .from("budget_goals")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("year_month", { ascending: false });

  if (yearMonth) query = query.eq("year_month", yearMonth);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:goals");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { year_month, limit_amount, department_id, category_id, alert_percent = 80 } = body;

  if (!year_month || typeof limit_amount !== "number") {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "year_month and limit_amount are required.", 400);
  }

  const { data, error } = await admin
    .from("budget_goals")
    .upsert(
      {
        org_id: auth.orgId,
        year_month,
        limit_amount,
        department_id: department_id || null,
        category_id: category_id || null,
        alert_percent,
        created_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,department_id,category_id,year_month" }
    )
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
