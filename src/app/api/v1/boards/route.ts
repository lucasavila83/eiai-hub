import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiPaginated, apiError, ApiErrorCode, requireScope, parsePagination, parseSort } from "@/lib/api";

/**
 * GET /api/v1/boards
 * Query: ?page=1&limit=20&sort=name&order=asc&archived=false
 * Returns: boards in the org that the user has access to
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:boards");
  if (scopeCheck) return scopeCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const { page, limit, offset } = parsePagination(searchParams);
  const archived = searchParams.get("archived") === "true";
  const sortConfig = parseSort(searchParams, ["name", "created_at", "updated_at"]);

  // Get boards the user is a member of
  const { data: memberBoards } = await admin
    .from("board_members")
    .select("board_id")
    .eq("user_id", auth.userId);

  const boardIds = (memberBoards || []).map((m: any) => m.board_id);

  if (boardIds.length === 0) {
    return apiPaginated([], page, limit, 0);
  }

  // Count
  const { count } = await admin
    .from("boards")
    .select("*", { count: "exact", head: true })
    .eq("org_id", auth.orgId)
    .eq("is_archived", archived)
    .in("id", boardIds);

  // Fetch
  let query = admin
    .from("boards")
    .select("id, name, description, is_archived, created_at, updated_at, created_by")
    .eq("org_id", auth.orgId)
    .eq("is_archived", archived)
    .in("id", boardIds);

  if (sortConfig) {
    query = query.order(sortConfig.sort, { ascending: sortConfig.order === "asc" });
  } else {
    query = query.order("name");
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiPaginated(data || [], page, limit, count || 0);
});

/**
 * POST /api/v1/boards
 * Body: { name, description? }
 * Creates a new board
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:boards");
  if (scopeCheck) return scopeCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { name, description } = await req.json();
  if (!name?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "name is required.", 400);
  }

  const { data: board, error } = await admin
    .from("boards")
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      description: description || null,
      created_by: auth.userId,
      is_archived: false,
    })
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Add creator as board member
  await admin.from("board_members").insert({
    board_id: board.id,
    user_id: auth.userId,
    role: "owner",
  });

  // Create default columns
  const defaultColumns = ["A Fazer", "Fazendo", "Concluído"];
  const colors = ["#6b7280", "#3b82f6", "#22c55e"];
  await admin.from("columns").insert(
    defaultColumns.map((name, i) => ({
      board_id: board.id,
      name,
      position: i,
      color: colors[i],
    }))
  );

  return apiSuccess(board, 201);
});
