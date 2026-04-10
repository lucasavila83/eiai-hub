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

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:automations");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("board_id");

  let query = admin
    .from("automations")
    .select("id, name, board_id, is_active, trigger_type, trigger_config, action_type, action_config, run_count, last_run_at, created_at, updated_at")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (boardId) query = query.eq("board_id", boardId);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:automations");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { name, board_id, trigger_type, trigger_config = {}, action_type, action_config = {}, is_active = true } = body;

  if (!name?.trim() || !trigger_type || !action_type) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "name, trigger_type, action_type are required.", 400);
  }

  const { data, error } = await admin
    .from("automations")
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      board_id: board_id || null,
      trigger_type,
      trigger_config,
      action_type,
      action_config,
      is_active,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
