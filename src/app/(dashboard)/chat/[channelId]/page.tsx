import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";

interface Props {
  params: Promise<{ channelId: string }>;
}

export default async function ChannelPage({ params }: Props) {
  const { channelId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (!channel) redirect("/chat");

  const { data: messages } = await supabase
    .from("messages")
    .select(`
      *,
      profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)
    `)
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  return <ChatWindow channel={channel} initialMessages={messages || []} currentUserId={user.id} />;
}
