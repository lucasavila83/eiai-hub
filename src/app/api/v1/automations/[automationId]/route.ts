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

function getAutomationId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("automations") + 1];
}

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:automations");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const id = getAutomationId(req);
  const body = await req.json();

  const allowed = ["name", "is_active", "trigger_type", "trigger_config", "action_type", "action_config", "board_id"];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

  const { data, error } = await admin
    .from("automations")
    .update(updates)
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Automation not found.", 404);
  return apiSuccess(data);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:automations");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const id = getAutomationId(req);

  const { error } = await admin
    .from("automations")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ deleted: true });
});
