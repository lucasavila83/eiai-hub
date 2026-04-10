import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getGoalId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("budget") + 1];
}

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:goals");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const goalId = getGoalId(req);

  const { error } = await admin
    .from("budget_goals")
    .delete()
    .eq("id", goalId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ deleted: true });
});
