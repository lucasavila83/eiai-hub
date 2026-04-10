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

function getChannelId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.indexOf("channels") + 1];
}

export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:channels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const channelId = getChannelId(req);

  const { data: channel } = await admin
    .from("channels")
    .select("id, org_id, team_id, name, description, type, created_by, is_archived, created_at")
    .eq("id", channelId)
    .eq("org_id", auth.orgId)
    .single();

  if (!channel) return apiError(ApiErrorCode.NOT_FOUND, "Channel not found.", 404);

  const { count: memberCount } = await admin
    .from("channel_members")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", channelId);

  return apiSuccess({ ...channel, member_count: memberCount || 0 });
});

export const PATCH = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:channels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const channelId = getChannelId(req);
  const body = await req.json();

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

  const { data, error } = await admin
    .from("channels")
    .update(updates)
    .eq("id", channelId)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.NOT_FOUND, "Channel not found.", 404);
  return apiSuccess(data);
});

export const DELETE = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:channels");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const channelId = getChannelId(req);

  const { error } = await admin
    .from("channels")
    .update({ is_archived: true })
    .eq("id", channelId)
    .eq("org_id", auth.orgId);

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess({ archived: true });
});
