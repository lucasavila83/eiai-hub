import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiError, ApiErrorCode } from "./response";

export interface ApiAuth {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member" | "guest";
  method: "bearer" | "api_key";
  keyId?: string; // only for api_key auth
  scopes?: string[]; // only for api_key auth
}

/**
 * Authenticate an API v1 request.
 * Supports:
 *  1. Bearer token (Supabase JWT) + X-Org-Id header
 *  2. API Key via X-API-Key header (org resolved from key)
 */
export async function authenticateRequest(req: NextRequest): Promise<ApiAuth | NextResponse> {
  const authHeader = req.headers.get("authorization");
  const apiKey = req.headers.get("x-api-key");

  if (apiKey) {
    return authenticateApiKey(req, apiKey);
  }

  if (authHeader?.startsWith("Bearer ")) {
    return authenticateBearer(req, authHeader);
  }

  return apiError(ApiErrorCode.UNAUTHORIZED, "Missing authentication. Use Bearer token or X-API-Key header.", 401);
}

async function authenticateBearer(req: NextRequest, authHeader: string): Promise<ApiAuth | NextResponse> {
  const token = authHeader.replace("Bearer ", "");
  const orgId = req.headers.get("x-org-id");

  if (!orgId) {
    return apiError(ApiErrorCode.BAD_REQUEST, "X-Org-Id header is required with Bearer auth.", 400);
  }

  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return apiError(ApiErrorCode.UNAUTHORIZED, "Invalid or expired token.", 401);
  }

  // Check org membership
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return apiError(ApiErrorCode.FORBIDDEN, "You are not a member of this organization.", 403);
  }

  return {
    userId: user.id,
    orgId,
    role: membership.role as ApiAuth["role"],
    method: "bearer",
  };
}

async function authenticateApiKey(req: NextRequest, rawKey: string): Promise<ApiAuth | NextResponse> {
  const admin = createAdminClient();

  // Hash the key to compare
  const keyHash = await hashKey(rawKey);

  const { data: apiKeyRecord } = await admin
    .from("api_keys")
    .select("id, org_id, scopes, is_active, expires_at, rate_limit, created_by")
    .eq("key_hash", keyHash)
    .single();

  if (!apiKeyRecord) {
    return apiError(ApiErrorCode.UNAUTHORIZED, "Invalid API key.", 401);
  }

  if (!apiKeyRecord.is_active) {
    return apiError(ApiErrorCode.UNAUTHORIZED, "API key is disabled.", 401);
  }

  if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
    return apiError(ApiErrorCode.UNAUTHORIZED, "API key has expired.", 401);
  }

  // Get the key creator's role
  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", apiKeyRecord.org_id)
    .eq("user_id", apiKeyRecord.created_by)
    .single();

  // Update last_used_at (fire-and-forget)
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyRecord.id)
    .then(() => {});

  return {
    userId: apiKeyRecord.created_by,
    orgId: apiKeyRecord.org_id,
    role: (membership?.role || "member") as ApiAuth["role"],
    method: "api_key",
    keyId: apiKeyRecord.id,
    scopes: apiKeyRecord.scopes || [],
  };
}

/**
 * Check if auth has a required scope (only relevant for API keys).
 * Bearer tokens have full access based on role.
 */
export function requireScope(auth: ApiAuth, scope: string): NextResponse | null {
  if (auth.method === "bearer") return null; // full access
  if (auth.scopes?.includes("*") || auth.scopes?.includes(scope)) return null;
  return apiError(ApiErrorCode.FORBIDDEN, `API key missing required scope: ${scope}`, 403);
}

/**
 * Check if auth has admin/owner role.
 */
export function requireAdmin(auth: ApiAuth): NextResponse | null {
  if (auth.role === "owner" || auth.role === "admin") return null;
  return apiError(ApiErrorCode.FORBIDDEN, "Admin or owner role required.", 403);
}

// --- Helpers ---

function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "eiai_";
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
