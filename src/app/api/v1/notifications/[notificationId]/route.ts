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

function getNotificationId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("notifications") + 1];
}

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:notifications");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const id = getNotificationId(req);
  const body = await req.json();

  if (typeof body.is_read !== "boolean") {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "is_read (boolean) is required.", 400);
  }

  const { data, error } = await admin
    .from("notifications")
    .update({ is_read: body.is_read })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Notification not found.", 404);
  return apiSuccess(data);
});
