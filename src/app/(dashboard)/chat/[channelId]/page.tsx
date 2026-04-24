"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Loader2, ShieldAlert } from "lucide-react";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    // Reset state immediately when channelId changes so the UI flips to
    // "Loading…" the moment the user clicks. Without this reset, the
    // previous channel's `channel`/`messages` stay on screen until the
    // new fetch resolves — 200–500 ms where the user thinks "my click
    // didn't do anything" and clicks again. That's the "need to click
    // twice" behaviour Lucas kept reporting.
    setLoading(true);
    setChannel(null);
    setMessages([]);
    setHasMore(false);
    setAccessDenied(false);

    // `aborted` flag — if the user clicks yet another channel before
    // this fetch returns, we drop the stale response on the floor so it
    // can't overwrite the newer channel's state.
    let aborted = false;

    (async () => {
      // Load channel and messages via server API (bypasses RLS)
      const res = await fetch("/api/chat/load-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      if (aborted) return;

      if (res.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        router.replace("/chat");
        return;
      }

      const data = await res.json();
      if (aborted) return;
      setChannel(data.channel);
      setMessages(data.messages || []);
      setHasMore(data.hasMore || false);
      setLoading(false);
    })();

    return () => {
      aborted = true;
    };
  }, [channelId]);

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldAlert className="w-10 h-10 text-destructive mb-3" />
        <h3 className="font-semibold text-foreground">Acesso negado</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Você não tem permissão para acessar esta conversa.
        </p>
        <button
          onClick={() => router.replace("/chat")}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Voltar ao chat
        </button>
      </div>
    );
  }

  if (loading || !channel) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ChatWindow channel={channel} initialMessages={messages} initialHasMore={hasMore} currentUserId={user.id} />;
}
