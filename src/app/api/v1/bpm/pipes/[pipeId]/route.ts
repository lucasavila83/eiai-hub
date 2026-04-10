import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getPipeId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("pipes") + 1];
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const pipeId = getPipeId(req);

  const { data: pipe } = await admin
    .from("bpm_pipes")
    .select("*")
    .eq("id", pipeId)
    .eq("org_id", auth.orgId)
    .single();

  if (!pipe) return apiError(ApiErrorCode.NOT_FOUND, "Pipe not found.", 404);

  const { data: phases } = await admin
    .from("bpm_phases")
    .select("*")
    .eq("pipe_id", pipeId)
    .order("position");

  const phaseIds = (phases || []).map((p: any) => p.id);
  const { data: fields } = phaseIds.length
    ? await admin
        .from("bpm_fields")
        .select("*")
        .in("phase_id", phaseIds)
    : { data: [] as any[] };

  return apiSuccess({ ...pipe, phases: phases || [], fields: fields || [] });
});

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const pipeId = getPipeId(req);
  const body = await req.json();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "description", "icon", "color", "is_archived", "settings"]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { data, error } = await admin
    .from("bpm_pipes")
    .update(updates)
    .eq("id", pipeId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Pipe not found.", 404);
  return apiSuccess(data);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const pipeId = getPipeId(req);

  const { error } = await admin
    .from("bpm_pipes")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", pipeId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ archived: true });
});
