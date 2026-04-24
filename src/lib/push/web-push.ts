/**
 * Web Push helper.
 *
 * Wraps the `web-push` library with our VAPID credentials so the rest of the
 * app can just call `sendPushToUsers(userIds, payload)`.
 *
 * Requires the following env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   — public key, also embedded in the client
 *   VAPID_PRIVATE_KEY              — private key (server only)
 *   VAPID_SUBJECT                  — mailto: contact for push services
 */
import webpush from "web-push";
import { createClient as createAdmin } from "@supabase/supabase-js";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@lesco.com.br";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    throw new Error("VAPID keys not configured (set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY env vars)");
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

/**
 * Send a push notification to one or more users. Looks up all of their
 * registered subscriptions and fires in parallel. Dead subscriptions
 * (410 Gone) are auto-deleted so future calls don't keep retrying.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  try {
    ensureConfigured();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[push] not configured:", err);
    return { sent: 0, failed: 0 };
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body
        );
        sent++;
      } catch (err: any) {
        failed++;
        // 410 Gone or 404 Not Found → subscription is dead
        const status = err?.statusCode;
        if (status === 410 || status === 404) {
          deadIds.push(s.id);
        } else {
          // eslint-disable-next-line no-console
          console.warn("[push] send failed:", status, err?.body || err?.message);
        }
      }
    })
  );

  // Cleanup dead subscriptions
  if (deadIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", deadIds);
  }

  return { sent, failed };
}
