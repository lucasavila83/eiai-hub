"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { useChatStore } from "@/lib/stores/chat-store";
import { Hash, Lock } from "lucide-react";
import type { Channel, Message } from "@/lib/types/database";

interface Props {
  channel: Channel;
  initialMessages: (Message & { profiles: any })[];
  currentUserId: string;
}

export function ChatWindow({ channel, initialMessages, currentUserId }: Props) {
  const supabase = createClient();
  const { messages, setMessages, addMessage, markAsRead } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const channelMessages = messages[channel.id] || [];

  useEffect(() => {
    setMessages(channel.id, initialMessages as any);
    markAsRead(channel.id);
  }, [channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length]);

  useEffect(() => {
    const sub = supabase
      .channel(`messages:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const { data: msg } = await supabase
            .from("messages")
            .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
            .eq("id", payload.new.id)
            .single();
          if (msg) addMessage(channel.id, msg as any);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  async function sendMessage(content: string) {
    await supabase.from("messages").insert({
      channel_id: channel.id,
      user_id: currentUserId,
      content,
      mentions: [],
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        {channel.type === "private" ? (
          <Lock className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Hash className="w-4 h-4 text-muted-foreground" />
        )}
        <h2 className="font-semibold text-foreground">{channel.name}</h2>
        {channel.description && (
          <>
            <span className="text-border">|</span>
            <p className="text-sm text-muted-foreground truncate">{channel.description}</p>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {channelMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Hash className="w-10 h-10 text-muted-foreground mb-2" />
            <h3 className="font-semibold text-foreground">Bem-vindo ao #{channel.name}!</h3>
            <p className="text-sm text-muted-foreground mt-1">Esta é o início do canal. Comece a conversa!</p>
          </div>
        )}
        {channelMessages.map((msg: any, i: number) => {
          const prev = channelMessages[i - 1] as any;
          const showHeader =
            !prev ||
            prev.user_id !== msg.user_id ||
            new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              showHeader={showHeader}
              isOwn={msg.user_id === currentUserId}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={sendMessage} channelName={channel.name} />
    </div>
  );
}
