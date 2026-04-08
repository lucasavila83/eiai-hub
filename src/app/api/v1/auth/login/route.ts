import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiSuccess, apiError, ApiErrorCode, withErrorHandler } from "@/lib/api";

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Returns: access_token, refresh_token, expires_in, user
 *
 * No auth required — this IS the auth endpoint.
 */
export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { email, password } = await req.json();

    if (!email || !password) {
      return apiError(ApiErrorCode.VALIDATION_ERROR, "email and password are required.", 400);
    }

    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return apiError(ApiErrorCode.UNAUTHORIZED, "Invalid email or password.", 401);
    }

    // Get user's organizations
    const admin = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id, role, organizations(id, name, slug)")
      .eq("user_id", data.user.id);

    return apiSuccess({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: "Bearer",
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name || null,
      },
      organizations: (memberships || []).map((m: any) => ({
        id: m.org_id,
        name: m.organizations?.name,
        slug: m.organizations?.slug,
        role: m.role,
      })),
    });
  });
}
