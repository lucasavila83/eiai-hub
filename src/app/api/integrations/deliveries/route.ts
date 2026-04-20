/**
 * GET /api/integrations/deliveries?integration_id=...&limit=50
 *
 * Returns the last N webhook delivery attempts for a given integration.
 * Caller must be org admin/owner (enforced by RLS on webhook_deliveries).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrationId = req.nextUrl.searchParams.get("integration_id");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50", 10), 500);
  if (!integrationId) {
    return NextResponse.json({ error: "integration_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("id, event_type, target_url, response_status, error, duration_ms, delivered_at, request_body, response_body")
    .eq("integration_id", integrationId)
    .order("delivered_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deliveries: data || [] });
}
