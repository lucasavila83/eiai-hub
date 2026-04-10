import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:notifications");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { error, count } = await admin
    .from("notifications")
    .update({ is_read: true }, { count: "exact" })
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId)
    .eq("is_read", false);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ updated: count || 0 });
});
