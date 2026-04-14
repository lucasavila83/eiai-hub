import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, apiPaginated, apiError, ApiErrorCode, requireScope, requireAdmin, parsePagination } from "@/lib/api";
import { ensureDmChannel } from "@/lib/api/dm-helpers";

/**
 * GET /api/v1/orgs/:orgId/members
 * Returns: list of org members with profiles
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:orgs");
  if (scopeCheck) return scopeCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const { page, limit, offset } = parsePagination(searchParams);

  // Count total
  const { count } = await admin
    .from("org_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", auth.orgId);

  // Fetch page
  const { data, error } = await admin
    .from("org_members")
    .select("user_id, role, joined_at, profiles:user_id(id, full_name, email, avatar_url)")
    .eq("org_id", auth.orgId)
    .order("joined_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  // Build map of otherUserId -> dm_channel_id for DMs the caller is part of
  const dmMap = new Map<string, string>();
  const { data: callerChannels } = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", auth.userId);

  const callerChannelIds = (callerChannels || []).map((c: any) => c.channel_id);
  if (callerChannelIds.length > 0) {
    const { data: dmChannels } = await admin
      .from("channels")
      .select("id")
      .eq("type", "dm")
      .eq("org_id", auth.orgId)
      .in("id", callerChannelIds);

    const dmChannelIds = (dmChannels || []).map((c: any) => c.id);
    if (dmChannelIds.length > 0) {
      const { data: otherMembers } = await admin
        .from("channel_members")
        .select("channel_id, user_id")
        .in("channel_id", dmChannelIds)
        .neq("user_id", auth.userId);

      (otherMembers || []).forEach((m: any) => {
        if (!dmMap.has(m.user_id)) dmMap.set(m.user_id, m.channel_id);
      });
    }
  }

  // If ?ensure_dm=true, create missing DMs between caller and each listed user
  const ensureDm = new URL(req.url).searchParams.get("ensure_dm") === "true";
  if (ensureDm) {
    for (const m of data || []) {
      if (m.user_id === auth.userId) continue;
      if (dmMap.has(m.user_id)) continue;
      const profile: any = m.profiles;
      const name = profile?.full_name || profile?.email || "DM";
      const id = await ensureDmChannel(admin, auth.orgId, auth.userId, m.user_id, name);
      if (id) dmMap.set(m.user_id, id);
    }
  }

  const members = (data || []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    profile: m.profiles,
    dm_channel_id: m.user_id === auth.userId ? null : dmMap.get(m.user_id) || null,
  }));

  return apiPaginated(members, page, limit, count || 0);
});

/**
 * POST /api/v1/orgs/:orgId/members
 * Body: { user_id, role }
 * Adds a member to the organization
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:orgs");
  if (scopeCheck) return scopeCheck;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { user_id, role = "member" } = await req.json();
  if (!user_id) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "user_id is required.", 400);
  }

  // Check if already a member
  const { data: existing } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", auth.orgId)
    .eq("user_id", user_id)
    .single();

  if (existing) {
    return apiError(ApiErrorCode.CONFLICT, "User is already a member of this organization.", 409);
  }

  const { data, error } = await admin
    .from("org_members")
    .insert({ org_id: auth.orgId, user_id, role })
    .select()
    .single();

  if (error) {
    return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  }

  return apiSuccess(data, 201);
});
