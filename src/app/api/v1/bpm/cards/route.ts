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
  const { searchParams } = new URL(req.url);
  const pipeId = searchParams.get("pipe_id");
  const phaseId = searchParams.get("phase_id");
  const assigneeId = searchParams.get("assignee_id");

  let query = admin
    .from("bpm_cards")
    .select("id, pipe_id, current_phase_id, title, assignee_id, priority, sla_deadline, started_at, completed_at, is_archived, metadata, created_at, updated_at, created_by")
    .eq("org_id", auth.orgId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (pipeId) query = query.eq("pipe_id", pipeId);
  if (phaseId) query = query.eq("current_phase_id", phaseId);
  if (assigneeId) query = query.eq("assignee_id", assigneeId);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { pipe_id, title, assignee_id, priority = "medium", values = {} } = body;

  if (!pipe_id || !title?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "pipe_id and title are required.", 400);
  }

  // Verify pipe belongs to org
  const { data: pipe } = await admin
    .from("bpm_pipes")
    .select("org_id")
    .eq("id", pipe_id)
    .single();
  if (!pipe || pipe.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Pipe not found.", 404);
  }

  // Find the start phase
  const { data: startPhase } = await admin
    .from("bpm_phases")
    .select("id, sla_hours")
    .eq("pipe_id", pipe_id)
    .eq("is_start", true)
    .single();

  const sla_deadline = startPhase?.sla_hours
    ? new Date(Date.now() + startPhase.sla_hours * 3600 * 1000).toISOString()
    : null;

  const { data: card, error } = await admin
    .from("bpm_cards")
    .insert({
      pipe_id,
      org_id: auth.orgId,
      current_phase_id: startPhase?.id || null,
      title: title.trim(),
      assignee_id: assignee_id || null,
      priority,
      sla_deadline,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  // Insert field values
  const valueEntries = Object.entries(values || {});
  if (valueEntries.length > 0) {
    await admin.from("bpm_card_values").insert(
      valueEntries.map(([field_id, value]) => ({
        card_id: card.id,
        field_id,
        value,
      }))
    );
  }

  return apiSuccess(card, 201);
});
