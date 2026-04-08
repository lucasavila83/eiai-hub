import { NextRequest } from "next/server";
import { apiHandler, apiSuccess } from "@/lib/api";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * GET /api/v1/auth/me
 * Returns: current user profile + org membership
 * Requires: Bearer token + X-Org-Id
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url, created_at")
    .eq("id", auth.userId)
    .single();

  const { data: membership } = await admin
    .from("org_members")
    .select("role, organizations(id, name, slug)")
    .eq("org_id", auth.orgId)
    .eq("user_id", auth.userId)
    .single();

  return apiSuccess({
    user: profile,
    organization: {
      id: auth.orgId,
      name: (membership as any)?.organizations?.name,
      slug: (membership as any)?.organizations?.slug,
      role: membership?.role,
    },
    auth_method: auth.method,
  });
});
