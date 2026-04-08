import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiPaginated, apiError, ApiErrorCode, requireScope, parsePagination } from "@/lib/api";

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
 * GET /api/v1/cards/:cardId/comments
 * Returns: paginated comments with author profiles
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);
  const { searchParams } = new URL(req.url);
  const { page, limit, offset } = parsePagination(searchParams);

  const { count } = await admin
    .from("card_comments")
    .select("*", { count: "exact", head: true })
    .eq("card_id", cardId);

  const { data, error } = await admin
    .from("card_comments")
    .select("id, content, created_at, updated_at, user_id, profiles:user_id(id, full_name, email, avatar_url)")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  const comments = (data || []).map((c: any) => ({
    id: c.id,
    content: c.content,
    created_at: c.created_at,
    updated_at: c.updated_at,
    author: c.profiles,
  }));

  return apiPaginated(comments, page, limit, count || 0);
});

/**
 * POST /api/v1/cards/:cardId/comments
 * Body: { content }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);
  const { content } = await req.json();

  if (!content?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "content is required.", 400);
  }

  const { data, error } = await admin
    .from("card_comments")
    .insert({
      card_id: cardId,
      user_id: auth.userId,
      content: content.trim(),
    })
    .select("id, content, created_at, user_id")
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Log activity
  await admin.from("activity_logs").insert({
    card_id: cardId,
    user_id: auth.userId,
    action: "commented",
    details: { source: "api" },
  });

  return apiSuccess(data, 201);
});
