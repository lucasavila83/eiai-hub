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
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      // Load channel and messages via server API (bypasses RLS)
      const res = await fetch("/api/chat/load-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });

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
      setChannel(data.channel);
      setMessages(data.messages || []);
      setLoading(false);
    })();
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

  return <ChatWindow channel={channel} initialMessages={messages} currentUserId={user.id} />;
}
