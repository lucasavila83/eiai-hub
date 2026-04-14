import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiError, ApiErrorCode, requireScope } from "@/lib/api";

/**
 * GET /api/v1/users/:userId
 * Returns: user profile (only if in same org)
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:users");
  if (scopeCheck) return scopeCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const userId = segments[segments.length - 1];

  // Check if target user is in same org
  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", auth.orgId)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    return apiError(ApiErrorCode.NOT_FOUND, "User not found in this organization.", 404);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url, created_at")
    .eq("id", userId)
    .single();

  if (!profile) {
    return apiError(ApiErrorCode.NOT_FOUND, "User profile not found.", 404);
  }

  // Find the DM channel between the caller and this user (if any)
  let dm_channel_id: string | null = null;
  if (userId !== auth.userId) {
    const { data: callerChannels } = await admin
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", auth.userId);

    const callerIds = (callerChannels || []).map((c: any) => c.channel_id);
    if (callerIds.length > 0) {
      const { data: shared } = await admin
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", userId)
        .in("channel_id", callerIds);

      const sharedIds = (shared || []).map((s: any) => s.channel_id);
      if (sharedIds.length > 0) {
        const { data: dmChannel } = await admin
          .from("channels")
          .select("id")
          .eq("type", "dm")
          .eq("org_id", auth.orgId)
          .in("id", sharedIds)
          .limit(1)
          .maybeSingle();
        if (dmChannel) dm_channel_id = dmChannel.id;
      }
    }
  }

  return apiSuccess({ ...profile, role: membership.role, dm_channel_id });
});

/**
 * PATCH /api/v1/users/:userId
 * Body: { full_name, avatar_url }
 * Updates user profile (only own profile)
 */
export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:users");
  if (scopeCheck) return scopeCheck;

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const userId = segments[segments.length - 1];

  // Can only update own profile
  if (userId !== auth.userId) {
    return apiError(ApiErrorCode.FORBIDDEN, "Can only update your own profile.", 403);
  }

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const allowedFields: Record<string, any> = {};
  if (body.full_name !== undefined) allowedFields.full_name = body.full_name;
  if (body.avatar_url !== undefined) allowedFields.avatar_url = body.avatar_url;

  if (Object.keys(allowedFields).length === 0) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "No valid fields to update.", 400);
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ ...allowedFields, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data);
});
