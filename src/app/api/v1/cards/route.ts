import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiPaginated, apiError, ApiErrorCode, requireScope, parsePagination, parseSort } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/v1/cards
 * Query: ?board_id=xxx&column_id=xxx&assignee=xxx&status=open|archived&priority=high&page=1&limit=20&sort=created_at&order=desc
 * Returns: cards with assignees
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const { page, limit, offset } = parsePagination(searchParams);

  const boardId = searchParams.get("board_id");
  const columnId = searchParams.get("column_id");
  const assignee = searchParams.get("assignee");
  const priority = searchParams.get("priority");
  const archived = searchParams.get("status") === "archived";
  const sortConfig = parseSort(searchParams, ["title", "created_at", "updated_at", "due_date", "priority", "position"]);

  // Build query
  let countQuery = admin
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", archived);

  let dataQuery = admin
    .from("cards")
    .select("id, title, description, priority, due_date, position, is_archived, created_at, updated_at, created_by, board_id, column_id, metadata")
    .eq("is_archived", archived);

  // Apply filters
  if (boardId) {
    countQuery = countQuery.eq("board_id", boardId);
    dataQuery = dataQuery.eq("board_id", boardId);
  }
  if (columnId) {
    countQuery = countQuery.eq("column_id", columnId);
    dataQuery = dataQuery.eq("column_id", columnId);
  }
  if (priority) {
    countQuery = countQuery.eq("priority", priority);
    dataQuery = dataQuery.eq("priority", priority);
  }

  // If filtering by assignee, get card IDs first
  if (assignee) {
    const { data: assigneeCards } = await admin
      .from("card_assignees")
      .select("card_id")
      .eq("user_id", assignee);
    const cardIds = (assigneeCards || []).map((a: any) => a.card_id);
    if (cardIds.length === 0) return apiPaginated([], page, limit, 0);
    countQuery = countQuery.in("id", cardIds);
    dataQuery = dataQuery.in("id", cardIds);
  }

  const { count } = await countQuery;

  if (sortConfig) {
    dataQuery = dataQuery.order(sortConfig.sort, { ascending: sortConfig.order === "asc" });
  } else {
    dataQuery = dataQuery.order("position");
  }

  const { data: cards, error } = await dataQuery.range(offset, offset + limit - 1);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Enrich with assignees
  const cardIds = (cards || []).map((c: any) => c.id);
  const { data: allAssignees } = await admin
    .from("card_assignees")
    .select("card_id, user_id, profiles:user_id(id, full_name, email, avatar_url)")
    .in("card_id", cardIds.length > 0 ? cardIds : ["__none__"]);

  const assigneeMap: Record<string, any[]> = {};
  (allAssignees || []).forEach((a: any) => {
    if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
    assigneeMap[a.card_id].push({ user_id: a.user_id, profile: a.profiles });
  });

  const enriched = (cards || []).map((c: any) => ({
    ...c,
    assignees: assigneeMap[c.id] || [],
  }));

  return apiPaginated(enriched, page, limit, count || 0);
});

/**
 * POST /api/v1/cards
 * Body: { board_id, column_id, title, description?, priority?, due_date?, assignee_ids?[] }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();

  const { board_id, column_id, title, description, priority, due_date, assignee_ids } = body;

  if (!board_id || !column_id || !title?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "board_id, column_id, and title are required.", 400);
  }

  // Verify board belongs to org
  const { data: board } = await admin
    .from("boards")
    .select("id")
    .eq("id", board_id)
    .eq("org_id", auth.orgId)
    .single();

  if (!board) {
    return apiError(ApiErrorCode.NOT_FOUND, "Board not found in this organization.", 404);
  }

  // Get max position
  const { data: existingCards } = await admin
    .from("cards")
    .select("position")
    .eq("column_id", column_id)
    .order("position", { ascending: false })
    .limit(1);

  const position = (existingCards?.[0]?.position ?? -1) + 1;

  const { data: card, error } = await admin
    .from("cards")
    .insert({
      board_id,
      column_id,
      title: title.trim(),
      description: description || null,
      priority: priority || "none",
      due_date: due_date || null,
      position,
      created_by: auth.userId,
      is_archived: false,
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Assign users if provided
  if (assignee_ids?.length > 0) {
    await admin.from("card_assignees").insert(
      assignee_ids.map((uid: string) => ({ card_id: card.id, user_id: uid }))
    );
  }

  // Log activity
  await admin.from("activity_logs").insert({
    card_id: card.id,
    user_id: auth.userId,
    action: "created",
    details: { title: card.title, source: "api" },
  });

  // Mirror & gcal sync (fire-and-forget)
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : ""}${req.headers.get("host") ? `http://${req.headers.get("host")}` : ""}/api/cards/mirror`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_id: card.id, board_id }),
  }).catch(() => {});

  return apiSuccess({ ...card, assignees: assignee_ids || [] }, 201);
});
