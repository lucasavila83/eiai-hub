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

function getEventId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("events") + 1];
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:events");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const eventId = getEventId(req);

  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("org_id", auth.orgId)
    .single();

  if (!event) return apiError(ApiErrorCode.NOT_FOUND, "Event not found.", 404);

  const { data: participants } = await admin
    .from("event_participants")
    .select("user_id, status")
    .eq("event_id", eventId);

  return apiSuccess({ ...event, participants: participants || [] });
});

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:events");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const eventId = getEventId(req);
  const body = await req.json();

  const allowed = ["title", "description", "start_at", "end_at", "all_day", "color", "location", "card_id"];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

  const { data, error } = await admin
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Event not found.", 404);
  return apiSuccess(data);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:events");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const eventId = getEventId(req);

  const { error } = await admin
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ deleted: true });
});
