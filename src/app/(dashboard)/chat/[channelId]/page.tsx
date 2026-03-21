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
  const { user, supabase } = useAuth();

  useEffect(() => {
    (async () => {
      // 1. Verify user is a member of this channel
      const { data: membership } = await supabase
        .from("channel_members")
        .select("id")
        .eq("channel_id", channelId)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        // For public channels, auto-join; for DMs/private, deny access
        const { data: ch } = await supabase
          .from("channels")
          .select("type")
          .eq("id", channelId)
          .single();

        if (ch?.type === "public") {
          // Auto-join public channel
          await supabase.from("channel_members").insert({
            channel_id: channelId,
            user_id: user.id,
            notifications: "all",
          });
        } else {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }

      // 2. Load channel and messages
      const [channelRes, messagesRes] = await Promise.all([
        supabase.from("channels").select("*").eq("id", channelId).single(),
        supabase
          .from("messages")
          .select(`*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)`)
          .eq("channel_id", channelId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(50),
      ]);

      if (!channelRes.data) { router.replace("/chat"); return; }

      setChannel(channelRes.data);
      setMessages(messagesRes.data || []);
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
