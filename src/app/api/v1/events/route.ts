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
 * GET /api/v1/events
 * Query: ?from=ISO&to=ISO&card_id=uuid
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:events");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const cardId = searchParams.get("card_id");

  let query = admin
    .from("events")
    .select("id, title, description, start_at, end_at, all_day, color, location, created_by, card_id, created_at, updated_at")
    .eq("org_id", auth.orgId)
    .order("start_at");

  if (from) query = query.gte("start_at", from);
  if (to) query = query.lte("start_at", to);
  if (cardId) query = query.eq("card_id", cardId);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  return apiSuccess(data || []);
});

/**
 * POST /api/v1/events
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:events");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { title, description, start_at, end_at, all_day = false, color = "#3b82f6", location, card_id, participant_ids = [] } = body;

  if (!title?.trim()) return apiError(ApiErrorCode.VALIDATION_ERROR, "title is required.", 400);
  if (!start_at) return apiError(ApiErrorCode.VALIDATION_ERROR, "start_at is required.", 400);

  const { data: event, error } = await admin
    .from("events")
    .insert({
      org_id: auth.orgId,
      title: title.trim(),
      description: description || null,
      start_at,
      end_at: end_at || null,
      all_day,
      color,
      location: location || null,
      created_by: auth.userId,
      card_id: card_id || null,
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  // Add participants
  if (participant_ids.length > 0) {
    await admin.from("event_participants").insert(
      participant_ids.map((user_id: string) => ({
        event_id: event.id,
        user_id,
        status: "pending" as const,
      }))
    );
  }

  return apiSuccess(event, 201);
});
