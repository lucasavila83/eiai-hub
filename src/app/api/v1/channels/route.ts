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
 * GET /api/v1/channels
 * Query: ?type=public|private|dm&team_id=uuid
 * Lists channels the user is a member of in the active org
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:channels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const teamId = searchParams.get("team_id");

  // Channels the user belongs to
  const { data: memberships } = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", auth.userId);

  const channelIds = (memberships || []).map((m: any) => m.channel_id);
  if (channelIds.length === 0) return apiSuccess([]);

  let query = admin
    .from("channels")
    .select("id, org_id, team_id, name, description, type, created_by, is_archived, created_at")
    .eq("org_id", auth.orgId)
    .eq("is_archived", false)
    .in("id", channelIds);

  if (type) query = query.eq("type", type);
  if (teamId) query = query.eq("team_id", teamId);

  const { data, error } = await query.order("name");
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  return apiSuccess(data || []);
});

/**
 * POST /api/v1/channels
 * Body: { name, type?, team_id?, description? }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:channels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const body = await req.json();
  const { name, type = "public", team_id, description } = body;

  if (!name?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "name is required.", 400);
  }
  if (!["public", "private", "dm"].includes(type)) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "type must be public, private or dm.", 400);
  }

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      type,
      team_id: team_id || null,
      description: description || null,
      created_by: auth.userId,
      is_archived: false,
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  // Add creator as member
  await admin.from("channel_members").insert({
    channel_id: channel.id,
    user_id: auth.userId,
    last_read_at: new Date().toISOString(),
    notifications: "all",
  });

  return apiSuccess(channel, 201);
});
