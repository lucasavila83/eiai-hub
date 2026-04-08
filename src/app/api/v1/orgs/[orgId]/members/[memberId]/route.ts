import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope, requireAdmin } from "@/lib/api";

type Params = { params: Promise<{ orgId: string; memberId: string }> };

/**
 * PATCH /api/v1/orgs/:orgId/members/:memberId
 * Body: { role }
 * Updates a member's role
 */
export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:orgs");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Extract memberId from URL
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const memberId = segments[segments.length - 1];

  const { role } = await req.json();
  if (!role || !["owner", "admin", "member", "guest"].includes(role)) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "Valid role is required (owner, admin, member, guest).", 400);
  }

  const { data, error } = await admin
    .from("org_members")
    .update({ role })
    .eq("org_id", auth.orgId)
    .eq("user_id", memberId)
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.NOT_FOUND, "Member not found.", 404);
  }

  return apiSuccess(data);
});

/**
 * DELETE /api/v1/orgs/:orgId/members/:memberId
 * Removes a member from the organization
 */
export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:orgs");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const memberId = segments[segments.length - 1];

  // Prevent removing yourself
  if (memberId === auth.userId) {
    return apiError(ApiErrorCode.BAD_REQUEST, "Cannot remove yourself from the organization.", 400);
  }

  const { error } = await admin
    .from("org_members")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("user_id", memberId);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess({ deleted: true });
});
