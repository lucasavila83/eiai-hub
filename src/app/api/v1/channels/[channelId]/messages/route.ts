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

/**
 * GET /api/v1/channels/:channelId/messages
 * Query: ?limit=50&before=ISO_DATE
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:messages");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const channelId = getChannelId(req);
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const before = searchParams.get("before");

  // Verify channel belongs to org
  const { data: channel } = await admin
    .from("channels")
    .select("org_id")
    .eq("id", channelId)
    .single();

  if (!channel || channel.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Channel not found.", 404);
  }

  let query = admin
    .from("messages")
    .select("id, channel_id, user_id, content, reply_to, is_thread_root, thread_count, mentions, edited_at, deleted_at, metadata, created_at")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);

  return apiSuccess(data || []);
});

/**
 * POST /api/v1/channels/:channelId/messages
 * Body: { content, reply_to?, mentions? }
 */
export const POST = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "write:messages");
  if (scopeCheck) return scopeCheck;

  const admin = getAdmin();
  const channelId = getChannelId(req);
  const body = await req.json();
  const { content, reply_to, mentions = [] } = body;

  if (!content?.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "content is required.", 400);
  }

  // Verify channel belongs to org
  const { data: channel } = await admin
    .from("channels")
    .select("org_id")
    .eq("id", channelId)
    .single();

  if (!channel || channel.org_id !== auth.orgId) {
    return apiError(ApiErrorCode.NOT_FOUND, "Channel not found.", 404);
  }

  const { data: message, error } = await admin
    .from("messages")
    .insert({
      channel_id: channelId,
      user_id: auth.userId,
      content: content.trim(),
      reply_to: reply_to || null,
      is_thread_root: false,
      mentions,
      edited_at: null,
      deleted_at: null,
      metadata: {},
    })
    .select()
    .single();

  if (error) return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
  return apiSuccess(message, 201);
});
