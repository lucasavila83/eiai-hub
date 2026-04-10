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
  const scopeCheck = requireScope(auth, "read:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { data, error } = await admin
    .from("bpm_pipes")
    .select("id, name, description, icon, color, is_archived, settings, created_at, updated_at, created_by")
    .eq("org_id", auth.orgId)
    .eq("is_archived", false)
    .order("name");

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { name, description, icon = "workflow", color = "#6366f1" } = body;

  if (!name?.trim()) return apiError(ApiErrorCode.VALIDATION_ERROR, "name is required.", 400);

  const { data, error } = await admin
    .from("bpm_pipes")
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      description: description || null,
      icon,
      color,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
