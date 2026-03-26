import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
  return client;
}

// Global broadcast for instant chat notifications
// Uses native BroadcastChannel API (instant, same-origin) + Supabase broadcast (cross-device)
type MessageCallback = (msg: any) => void;
const broadcastListeners: Set<MessageCallback> = new Set();
let nativeBc: BroadcastChannel | null = null;
let supabaseBroadcastReady = false;

function ensureNativeBroadcast() {
  if (nativeBc || typeof window === "undefined") return;
  try {
    nativeBc = new BroadcastChannel("chat-notifications");
    nativeBc.onmessage = (event) => {
      const msg = event.data;
      if (msg) broadcastListeners.forEach((cb) => cb(msg));
    };
  } catch (_) {
    // BroadcastChannel not supported — fall back to Supabase only
  }
}

function ensureSupabaseBroadcast() {
  if (supabaseBroadcastReady) return;
  supabaseBroadcastReady = true;
  const supabase = createClient();
  supabase
    .channel("chat-broadcast")
    .on("broadcast", { event: "new-message" }, (event: any) => {
      const msg = event.payload;
      if (msg) broadcastListeners.forEach((cb) => cb(msg));
    })
    .subscribe();
}

export function onChatBroadcast(cb: MessageCallback) {
  broadcastListeners.add(cb);
  ensureNativeBroadcast();
  ensureSupabaseBroadcast();
  return () => { broadcastListeners.delete(cb); };
}

export function sendChatBroadcast(payload: any) {
  // 0. Notify listeners in THIS tab immediately (instant, no network)
  broadcastListeners.forEach((cb) => cb(payload));

  // 1. Native BroadcastChannel — instant, other tabs in same browser
  ensureNativeBroadcast();
  try { nativeBc?.postMessage(payload); } catch (_) {}

  // 2. Supabase broadcast — for other devices/browsers
  ensureSupabaseBroadcast();
  const supabase = createClient();
  const ch = supabase.channel("chat-broadcast");
  // Send regardless of state — Supabase queues if not yet joined
  ch.send({ type: "broadcast", event: "new-message", payload }).catch(() => {});
}
