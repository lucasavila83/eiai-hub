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
  return segments[segments.indexOf("boards") + 1];
}

/**
 * GET /api/v1/boards/:boardId/columns
 * Returns: columns with card counts
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:boards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const boardId = getBoardId(req);

  const { data: columns, error } = await admin
    .from("columns")
    .select("id, name, position, color")
    .eq("board_id", boardId)
    .order("position");

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Get card counts per column
  const { data: cards } = await admin
    .from("cards")
    .select("column_id")
    .eq("board_id", boardId)
    .eq("is_archived", false);

  const countMap: Record<string, number> = {};
  (cards || []).forEach((c: any) => {
    countMap[c.column_id] = (countMap[c.column_id] || 0) + 1;
  });

  const result = (columns || []).map((col: any) => ({
    ...col,
    card_count: countMap[col.id] || 0,
  }));

  return apiSuccess(result);
});

/**
 * POST /api/v1/boards/:boardId/columns
 * Body: { name, color?, position? }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:boards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const boardId = getBoardId(req);

  const { name, color, position } = await req.json();
  if (!name?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "name is required.", 400);
  }

  // Get max position if not specified
  let pos = position;
  if (pos === undefined) {
    const { data: existing } = await admin
      .from("columns")
      .select("position")
      .eq("board_id", boardId)
      .order("position", { ascending: false })
      .limit(1);
    pos = (existing?.[0]?.position ?? -1) + 1;
  }

  const { data, error } = await admin
    .from("columns")
    .insert({
      board_id: boardId,
      name: name.trim(),
      color: color || "#6b7280",
      position: pos,
    })
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data, 201);
});
