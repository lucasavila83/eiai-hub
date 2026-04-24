/**
 * POST /api/push/test
 *
 * Sends a test push notification to the current user (all their registered
 * devices). Useful to verify the full chain: subscription → web-push →
 * service worker → OS notification.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendPushToUsers([user.id], {
    title: "Lesco-Hub",
    body: "Notificações estão funcionando! 🎉",
    url: "/chat",
    tag: "test",
  });

  return NextResponse.json({ ok: true, ...result });
}
