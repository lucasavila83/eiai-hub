import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope, requireAdmin } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:teams");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { data, error } = await admin
    .from("teams")
    .select("id, name, description, color, created_at")
    .eq("org_id", auth.orgId)
    .order("name");

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:teams");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { name, description, color = "#6366f1" } = body;

  if (!name?.trim()) return apiError(ApiErrorCode.VALIDATION_ERROR, "name is required.", 400);

  const { data, error } = await admin
    .from("teams")
    .insert({ org_id: auth.orgId, name: name.trim(), description: description || null, color })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
