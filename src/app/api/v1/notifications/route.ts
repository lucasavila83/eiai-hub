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

/**
 * GET /api/v1/notifications
 * Query: ?is_read=false&limit=50
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:notifications");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const isReadParam = searchParams.get("is_read");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  let query = admin
    .from("notifications")
    .select("id, type, title, body, link, is_read, metadata, created_at")
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (isReadParam !== null) query = query.eq("is_read", isReadParam === "true");

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  return apiSuccess(data || []);
});
