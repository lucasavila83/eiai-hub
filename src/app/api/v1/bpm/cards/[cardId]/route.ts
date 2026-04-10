import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getCardId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("cards") + 1];
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { data: card } = await admin
    .from("bpm_cards")
    .select("*")
    .eq("id", cardId)
    .eq("org_id", auth.orgId)
    .single();

  if (!card) return apiError(ApiErrorCode.NOT_FOUND, "Card not found.", 404);

  const { data: values } = await admin
    .from("bpm_card_values")
    .select("field_id, value")
    .eq("card_id", cardId);

  return apiSuccess({ ...card, values: values || [] });
});

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);
  const body = await req.json();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ["title", "current_phase_id", "assignee_id", "priority", "completed_at", "is_archived", "metadata"]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { data: card, error } = await admin
    .from("bpm_cards")
    .update(updates)
    .eq("id", cardId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Card not found.", 404);

  // Update field values (upsert)
  if (body.values && typeof body.values === "object") {
    const entries = Object.entries(body.values);
    for (const [field_id, value] of entries) {
      await admin
        .from("bpm_card_values")
        .upsert(
          { card_id: cardId, field_id, value, updated_at: new Date().toISOString() },
          { onConflict: "card_id,field_id" }
        );
    }
  }

  return apiSuccess(card);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:bpm");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const cardId = getCardId(req);

  const { error } = await admin
    .from("bpm_cards")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ archived: true });
});
