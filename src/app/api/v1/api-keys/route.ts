import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiSuccess, apiError, ApiErrorCode, withErrorHandler } from "@/lib/api";
import { hashKey, generateApiKey } from "@/lib/api/middleware";

/**
 * GET /api/v1/api-keys
 * Returns: list of API keys for the org (admin only)
 * Uses cookie auth (internal frontend endpoint)
 */
export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError(ApiErrorCode.UNAUTHORIZED, "Not authenticated.", 401);

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    if (!orgId) return apiError(ApiErrorCode.BAD_REQUEST, "org_id is required.", 400);

    // Check admin role
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError(ApiErrorCode.FORBIDDEN, "Admin access required.", 403);
    }

    const { data: keys } = await admin
      .from("api_keys")
      .select("id, name, key_prefix, scopes, is_active, expires_at, last_used_at, rate_limit, created_at, created_by, profiles:created_by(full_name, email)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    return apiSuccess(keys || []);
  });
}

/**
 * POST /api/v1/api-keys
 * Body: { org_id, name, scopes?, expires_at?, rate_limit? }
 * Returns: the full API key (only shown once!)
 */
export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError(ApiErrorCode.UNAUTHORIZED, "Not authenticated.", 401);

    const body = await req.json();
    const { org_id, name, scopes, expires_at, rate_limit } = body;

    if (!org_id || !name?.trim()) {
      return apiError(ApiErrorCode.VALIDATION_ERROR, "org_id and name are required.", 400);
    }

    // Check admin role
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError(ApiErrorCode.FORBIDDEN, "Admin access required.", 403);
    }

    // Generate key
    const rawKey = generateApiKey();
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);

    const defaultScopes = ["read:boards", "write:boards", "read:cards", "write:cards", "read:orgs", "read:users", "write:users"];

    const { data: apiKeyRecord, error } = await admin
      .from("api_keys")
      .insert({
        org_id,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: scopes || defaultScopes,
        created_by: user.id,
        expires_at: expires_at || null,
        rate_limit: rate_limit || 100,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return apiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500);
    }

    // Return the raw key — this is the ONLY time it's visible
    return apiSuccess({
      ...apiKeyRecord,
      key: rawKey, // ⚠️ Only returned on creation
    }, 201);
  });
}

/**
 * DELETE /api/v1/api-keys?id=xxx&org_id=xxx
 * Deactivates an API key
 */
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError(ApiErrorCode.UNAUTHORIZED, "Not authenticated.", 401);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const orgId = searchParams.get("org_id");

    if (!id || !orgId) {
      return apiError(ApiErrorCode.VALIDATION_ERROR, "id and org_id are required.", 400);
    }

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError(ApiErrorCode.FORBIDDEN, "Admin access required.", 403);
    }

    await admin
      .from("api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);

    return apiSuccess({ deactivated: true });
  });
}
