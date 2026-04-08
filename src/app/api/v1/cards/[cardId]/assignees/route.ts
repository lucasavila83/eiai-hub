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
 * GET /api/v1/cards/:cardId/assignees
 * Returns: list of assignees with profiles
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { data, error } = await admin
    .from("card_assignees")
    .select("user_id, created_at, profiles:user_id(id, full_name, email, avatar_url)")
    .eq("card_id", cardId);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess((data || []).map((a: any) => ({ user_id: a.user_id, created_at: a.created_at, profile: a.profiles })));
});

/**
 * POST /api/v1/cards/:cardId/assignees
 * Body: { user_id }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);
  const { user_id } = await req.json();

  if (!user_id) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "user_id is required.", 400);
  }

  const { data, error } = await admin
    .from("card_assignees")
    .insert({ card_id: cardId, user_id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(ApiErrorCode.CONFLICT, "User is already assigned to this card.", 409);
    }
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data, 201);
});

/**
 * DELETE /api/v1/cards/:cardId/assignees
 * Body: { user_id }
 */
export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "user_id query param is required.", 400);
  }

  const { error } = await admin
    .from("card_assignees")
    .delete()
    .eq("card_id", cardId)
    .eq("user_id", userId);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess({ removed: true });
});
