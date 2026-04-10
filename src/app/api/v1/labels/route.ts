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
 * GET /api/v1/labels?board_id=uuid
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:labels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("board_id");

  if (!boardId) return apiError(ApiErrorCode.VALIDATION_ERROR, "board_id is required.", 400);

  // Verify board belongs to org
  const { data: board } = await admin
    .from("boards")
    .select("org_id")
    .eq("id", boardId)
    .single();
  if (!board || board.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Board not found.", 404);
  }

  const { data, error } = await admin
    .from("labels")
    .select("id, board_id, name, color, created_at")
    .eq("board_id", boardId)
    .order("name");

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data || []);
});

export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:labels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { board_id, name, color } = body;

  if (!board_id || !name?.trim() || !color) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "board_id, name, color are required.", 400);
  }

  const { data: board } = await admin
    .from("boards")
    .select("org_id")
    .eq("id", board_id)
    .single();
  if (!board || board.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Board not found.", 404);
  }

  const { data, error } = await admin
    .from("labels")
    .insert({ board_id, name: name.trim(), color })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(data, 201);
});
