import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { apiHandler, apiSuccess, requireScope } from "@/lib/api";

/**
 * GET /api/v1/orgs
 * Returns: current user's organization (based on X-Org-Id)
 */
export const GET = apiHandler(async (req: NextRequest, auth) => {
  const scopeCheck = requireScope(auth, "read:orgs");
  if (scopeCheck) return scopeCheck;

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, plan, settings, created_at")
    .eq("id", auth.orgId)
    .single();

  if (!org) {
    return apiSuccess(null);
  }

  return apiSuccess(org);
});
