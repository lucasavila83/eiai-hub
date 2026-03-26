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
type MessageCallback = (msg: any) => void;
const broadcastListeners: Set<MessageCallback> = new Set();
let broadcastReady = false;

export function onChatBroadcast(cb: MessageCallback) {
  broadcastListeners.add(cb);
  ensureBroadcastChannel();
  return () => { broadcastListeners.delete(cb); };
}

export function sendChatBroadcast(payload: any) {
  ensureBroadcastChannel();
  const supabase = createClient();
  supabase.channel("chat-broadcast").send({
    type: "broadcast",
    event: "new-message",
    payload,
  });
}

function ensureBroadcastChannel() {
  if (broadcastReady) return;
  broadcastReady = true;
  const supabase = createClient();
  supabase
    .channel("chat-broadcast")
    .on("broadcast", { event: "new-message" }, (event: any) => {
      const msg = event.payload;
      if (msg) broadcastListeners.forEach((cb) => cb(msg));
    })
    .subscribe();
}
