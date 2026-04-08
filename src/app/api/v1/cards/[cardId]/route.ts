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
 * GET /api/v1/cards/:cardId
 * Returns: full card detail with assignees, subtasks, labels, attachments
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { data: card } = await admin
    .from("cards")
    .select("*, columns(id, name, color), boards(id, name, org_id)")
    .eq("id", cardId)
    .single();

  if (!card || (card as any).boards?.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Card not found.", 404);
  }

  // Fetch related data in parallel
  const [assigneesRes, subtasksRes, labelsRes, attachmentsRes, commentsCountRes] = await Promise.all([
    admin.from("card_assignees")
      .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
      .eq("card_id", cardId),
    admin.from("subtasks")
      .select("id, title, is_completed, position")
      .eq("card_id", cardId)
      .order("position"),
    admin.from("card_labels")
      .select("label_id, labels(id, name, color)")
      .eq("card_id", cardId),
    admin.from("card_attachments")
      .select("id, file_name, file_url, file_type, file_size, created_at")
      .eq("card_id", cardId)
      .order("created_at"),
    admin.from("card_comments")
      .select("*", { count: "exact", head: true })
      .eq("card_id", cardId),
  ]);

  return apiSuccess({
    ...card,
    assignees: (assigneesRes.data || []).map((a: any) => ({ user_id: a.user_id, profile: a.profiles })),
    subtasks: subtasksRes.data || [],
    labels: (labelsRes.data || []).map((l: any) => l.labels),
    attachments: attachmentsRes.data || [],
    comment_count: commentsCountRes.count || 0,
  });
});

/**
 * PATCH /api/v1/cards/:cardId
 * Body: { title?, description?, priority?, due_date?, column_id?, position?, is_archived? }
 */
export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  // Verify card belongs to org
  const { data: existing } = await admin
    .from("cards")
    .select("id, board_id, column_id, boards(org_id)")
    .eq("id", cardId)
    .single();

  if (!existing || (existing as any).boards?.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Card not found.", 404);
  }

  const body = await req.json();
  const updates: Record<string, any> = {};
  const allowedFields = ["title", "description", "priority", "due_date", "column_id", "position", "is_archived", "metadata"];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  updates.updated_at = new Date().toISOString();

  // Track column move for activity log
  const movedColumn = body.column_id && body.column_id !== existing.column_id;

  const { data: card, error } = await admin
    .from("cards")
    .update(updates)
    .eq("id", cardId)
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Log activity
  if (movedColumn) {
    await admin.from("activity_logs").insert({
      card_id: cardId,
      user_id: auth.userId,
      action: "moved",
      details: { from_column: existing.column_id, to_column: body.column_id, source: "api" },
    });
  } else {
    await admin.from("activity_logs").insert({
      card_id: cardId,
      user_id: auth.userId,
      action: "updated",
      details: { fields: Object.keys(updates).filter(k => k !== "updated_at"), source: "api" },
    });
  }

  return apiSuccess(card);
});

/**
 * DELETE /api/v1/cards/:cardId
 * Archives the card (soft delete)
 */
export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:cards");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { data: existing } = await admin
    .from("cards")
    .select("id, boards(org_id)")
    .eq("id", cardId)
    .single();

  if (!existing || (existing as any).boards?.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Card not found.", 404);
  }

  await admin
    .from("cards")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", cardId);

  await admin.from("activity_logs").insert({
    card_id: cardId,
    user_id: auth.userId,
    action: "archived",
    details: { source: "api" },
  });

  return apiSuccess({ archived: true });
});
