"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Loader2 } from "lucide-react";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setCurrentUserId(user.id);

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

  if (loading || !channel) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ChatWindow channel={channel} initialMessages={messages} currentUserId={currentUserId} />;
}
