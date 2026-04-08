import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiSuccess, apiError, ApiErrorCode, withErrorHandler } from "@/lib/api";

/**
 * POST /api/v1/auth/refresh
 * Body: { refresh_token }
 * Returns: new access_token, refresh_token, expires_in
 */
export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { refresh_token } = await req.json();

    if (!refresh_token) {
      return apiError(ApiErrorCode.VALIDATION_ERROR, "refresh_token is required.", 400);
    }

    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
      return apiError(ApiErrorCode.UNAUTHORIZED, "Invalid or expired refresh token.", 401);
    }

    return apiSuccess({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: "Bearer",
    });
  });
}
