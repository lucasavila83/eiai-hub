import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/integrations/webhook/[orgId]
 * Receives incoming webhooks from external services.
 * Logs the payload and can trigger actions based on configured integrations.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = await createClient();

    // Find active webhook integrations for this org
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", orgId)
      .eq("type", "webhook")
      .eq("is_active", true);

    if (!integrations || integrations.length === 0) {
      return NextResponse.json(
        { received: true, processed: 0, message: "No active webhook integrations" },
        { status: 200 }
      );
    }

    let processed = 0;

    for (const integ of integrations) {
      // Update trigger count
      await supabase
        .from("integrations")
        .update({
          trigger_count: (integ.trigger_count || 0) + 1,
          last_triggered_at: new Date().toISOString(),
        })
        .eq("id", integ.id);

      processed++;
    }

    return NextResponse.json({
      received: true,
      processed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Also accept GET for webhook verification (some services send a GET first)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  return NextResponse.json({
    status: "ok",
    org_id: orgId,
    message: "Webhook endpoint active",
  });
}
