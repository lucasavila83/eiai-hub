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

function getCardId(req: NextRequest): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  return segments[segments.indexOf("cards") + 1];
}

/**
 * GET /api/v1/cards/:cardId/subtasks
 * Returns: list of subtasks
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { data, error } = await admin
    .from("subtasks")
    .select("id, title, is_completed, position, created_at")
    .eq("card_id", cardId)
    .order("position");

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data || []);
});

/**
 * POST /api/v1/cards/:cardId/subtasks
 * Body: { title }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);
  const { title } = await req.json();

  if (!title?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "title is required.", 400);
  }

  // Get max position
  const { data: existing } = await admin
    .from("subtasks")
    .select("position")
    .eq("card_id", cardId)
    .order("position", { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await admin
    .from("subtasks")
    .insert({
      card_id: cardId,
      title: title.trim(),
      is_completed: false,
      position,
    })
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data, 201);
});

/**
 * PATCH /api/v1/cards/:cardId/subtasks
 * Body: { id, title?, is_completed? }
 */
export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { id, title, is_completed } = await req.json();

  if (!id) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "id is required.", 400);
  }

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (is_completed !== undefined) updates.is_completed = is_completed;

  const { data, error } = await admin
    .from("subtasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.NOT_FOUND, "Subtask not found.", 404);
  }

  return apiSuccess(data);
});
