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

function getTeamId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("teams") + 1];
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:teams");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const teamId = getTeamId(req);

  const { data: team } = await admin
    .from("teams")
    .select("id, name, description, color, created_at")
    .eq("id", teamId)
    .eq("org_id", auth.orgId)
    .single();

  if (!team) return apiError(ApiErrorCode.NOT_FOUND, "Team not found.", 404);

  const { data: members } = await admin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId);

  return apiSuccess({ ...team, members: members || [] });
});

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:teams");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = getAdmin();
  const teamId = getTeamId(req);
  const body = await req.json();

  const updates: Record<string, any> = {};
  for (const k of ["name", "description", "color"]) if (body[k] !== undefined) updates[k] = body[k];

  const { data, error } = await admin
    .from("teams")
    .update(updates)
    .eq("id", teamId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Team not found.", 404);
  return apiSuccess(data);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:teams");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = getAdmin();
  const teamId = getTeamId(req);

  const { error } = await admin
    .from("teams")
    .delete()
    .eq("id", teamId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ deleted: true });
});
