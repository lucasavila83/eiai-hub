import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiError, ApiErrorCode } from "./response";
import type { ApiAuth } from "./middleware";

// In-memory rate limit cache (per-instance, resets on deploy)
const rateLimitCache = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000; // 1 minute

function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Check rate limit for the authenticated request.
 * Returns null if OK, or a 429 response if exceeded.
 *
 * Uses in-memory cache for speed, with async DB persistence for analytics.
 */
export function checkRateLimit(auth: ApiAuth, endpoint: string): NextResponse | null {
  const maxRequests = auth.method === "api_key" ? 100 : 1000; // API keys: 100/min, Bearer: 1000/min
  const cacheKey = auth.method === "api_key"
    ? `key:${auth.keyId}:${endpoint}`
    : `user:${auth.userId}:${endpoint}`;

  const now = Date.now();
  const entry = rateLimitCache.get(cacheKey);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      const response = apiError(ApiErrorCode.RATE_LIMITED, `Rate limit exceeded. Retry after ${retryAfter}s.`, 429);
      response.headers.set("Retry-After", String(retryAfter));
      response.headers.set("X-RateLimit-Limit", String(maxRequests));
      response.headers.set("X-RateLimit-Remaining", "0");
      return response;
    }
  } else {
    rateLimitCache.set(cacheKey, { count: 1, windowStart: now });
  }

  return null;
}

/**
 * Log API request for analytics (fire-and-forget).
 */
export function logApiRequest(
  auth: ApiAuth,
  method: string,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number,
  req: Request
) {
  const admin = createAdminClient();
  admin
    .from("api_logs")
    .insert({
      key_id: auth.keyId || null,
      user_id: auth.userId,
      method,
      endpoint,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      ip_address: (req.headers as any).get?.("x-forwarded-for") || null,
      user_agent: (req.headers as any).get?.("user-agent") || null,
    })
    .then(() => {})
    .catch(() => {});
}
