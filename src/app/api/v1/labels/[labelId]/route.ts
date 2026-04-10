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

function getLabelId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("labels") + 1];
}

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:labels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const labelId = getLabelId(req);

  // Verify label belongs to a board in the user's org
  const { data: label } = await admin
    .from("labels")
    .select("id, boards:board_id(org_id)")
    .eq("id", labelId)
    .single();

  if (!label || (label as any).boards?.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Label not found.", 404);
  }

  const { error } = await admin.from("labels").delete().eq("id", labelId);
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ deleted: true });
});
