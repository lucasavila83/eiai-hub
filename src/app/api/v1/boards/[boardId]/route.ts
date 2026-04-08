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

function getBoardId(req: NextRequest): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  // /api/v1/boards/[boardId]
  return segments[segments.indexOf("boards") + 1];
}

/**
 * GET /api/v1/boards/:boardId
 * Returns: board detail with columns and member count
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:boards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const boardId = getBoardId(req);

  const { data: board } = await admin
    .from("boards")
    .select("id, name, description, is_archived, created_at, updated_at, created_by")
    .eq("id", boardId)
    .eq("org_id", auth.orgId)
    .single();

  if (!board) {
    return apiError(ApiErrorCode.NOT_FOUND, "Board not found.", 404);
  }

  // Get columns
  const { data: columns } = await admin
    .from("columns")
    .select("id, name, position, color")
    .eq("board_id", boardId)
    .order("position");

  // Get member count
  const { count: memberCount } = await admin
    .from("board_members")
    .select("*", { count: "exact", head: true })
    .eq("board_id", boardId);

  // Get card count
  const { count: cardCount } = await admin
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("board_id", boardId)
    .eq("is_archived", false);

  return apiSuccess({
    ...board,
    columns: columns || [],
    member_count: memberCount || 0,
    card_count: cardCount || 0,
  });
});

/**
 * PATCH /api/v1/boards/:boardId
 * Body: { name?, description?, is_archived? }
 */
export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:boards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const boardId = getBoardId(req);

  const body = await req.json();
  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_archived !== undefined) updates.is_archived = body.is_archived;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("boards")
    .update(updates)
    .eq("id", boardId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.NOT_FOUND, "Board not found.", 404);
  }

  return apiSuccess(data);
});

/**
 * DELETE /api/v1/boards/:boardId
 * Archives the board (soft delete)
 */
export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:boards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const boardId = getBoardId(req);

  const { error } = await admin
    .from("boards")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .eq("org_id", auth.orgId);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess({ archived: true });
});
