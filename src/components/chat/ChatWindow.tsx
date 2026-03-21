"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { CreateTaskModal } from "./CreateTaskModal";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { EmailComposeModal } from "./EmailComposeModal";
import { useChatStore } from "@/lib/stores/chat-store";
import {
  Hash, Lock, MessageSquare, ListTodo,
  Kanban, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils/helpers";
import type { Channel, Message } from "@/lib/types/database";

interface Props {
  channel: Channel;
  initialMessages: (Message & { profiles: any })[];
  currentUserId: string;
}

// Helper: get date label for separator
function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Hoje";
  if (msgDate.getTime() === yesterday.getTime()) return "Ontem";
  return formatDate(dateStr);
}

// Helper: check if two dates are on different days
function isDifferentDay(d1: string, d2: string): boolean {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

const priorityConfig: Record<string, { color: string; icon: any; label: string }> = {
  urgent: { color: "text-red-500", icon: AlertCircle, label: "Urgente" },
  high: { color: "text-orange-500", icon: AlertCircle, label: "Alta" },
  medium: { color: "text-yellow-500", icon: Clock, label: "Média" },
  low: { color: "text-primary", icon: Clock, label: "Baixa" },
  none: { color: "text-muted-foreground", icon: Clock, label: "Sem prioridade" },
};

export function ChatWindow({ channel, initialMessages, currentUserId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { messages, setMessages, addMessage, markAsRead } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "tasks">("chat");
  const [tasks, setTasks] = useState<any[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDefaultTitle, setTaskDefaultTitle] = useState("");
  const [taskDefaultAssigneeId, setTaskDefaultAssigneeId] = useState<string | undefined>();
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardContent, setForwardContent] = useState("");
  const [forwardSender, setForwardSender] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [emailSender, setEmailSender] = useState("");

  const channelMessages = messages[channel.id] || [];

  // Get the other user's name for DMs
  const otherUserName = useMemo(() => {
    if (channel.type !== "dm") return null;
    const otherMsg = channelMessages.find((m: any) => m.user_id !== currentUserId);
    return otherMsg?.profiles?.full_name || otherMsg?.profiles?.email || channel.name;
  }, [channel, channelMessages, currentUserId]);

  // Load initial data
  useEffect(() => {
    setMessages(channel.id, initialMessages as any);

    // Pre-cache own profile for optimistic updates
    if (!profileCacheRef.current[currentUserId]) {
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email, is_ai_agent")
        .eq("id", currentUserId)
        .single()
        .then(({ data }) => {
          if (data) profileCacheRef.current[currentUserId] = data;
        });
    }

    // Get last_read_at before updating it (for "Novo" marker)
    supabase
      .from("channel_members")
      .select("last_read_at")
      .eq("channel_id", channel.id)
      .eq("user_id", currentUserId)
      .single()
      .then(({ data }) => {
        if (data) setLastReadAt(data.last_read_at);
      });

    markAsRead(channel.id);

    // Update last_read_at
    supabase
      .from("channel_members")
      .upsert({
        channel_id: channel.id,
        user_id: currentUserId,
        last_read_at: new Date().toISOString(),
        notifications: "all",
      }, { onConflict: "channel_id,user_id" })
      .then();
  }, [channel.id]);

  // Scroll to bottom
  useEffect(() => {
    if (activeTab === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [channelMessages.length, activeTab]);

  // Profile cache for realtime messages
  const profileCacheRef = useRef<Record<string, any>>({});

  // Enrich a raw message payload with profile data
  async function enrichMessage(raw: any) {
    const userId = raw.user_id;
    if (!profileCacheRef.current[userId]) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email, is_ai_agent")
        .eq("id", userId)
        .single();
      if (profile) profileCacheRef.current[userId] = profile;
    }
    return { ...raw, profiles: profileCacheRef.current[userId] || null };
  }

  // Realtime subscription + polling fallback
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
          const raw = payload.new;
          // Skip own messages (already added via optimistic update)
          if (raw.user_id === currentUserId) return;
          // Avoid duplicates
          const existing = useChatStore.getState().messages[channel.id] || [];
          if (existing.some((m: any) => m.id === raw.id)) return;
          const enriched = await enrichMessage(raw);
          addMessage(channel.id, enriched as any);
        }
      )
      .subscribe();

    // Polling fallback every 3s for messages that realtime might miss
    const pollInterval = setInterval(async () => {
      const currentMsgs = useChatStore.getState().messages[channel.id] || [];
      const lastMsg = currentMsgs.filter((m: any) => !m._optimistic).pop();
      const since = lastMsg?.created_at || new Date(0).toISOString();

      const { data: newMsgs } = await supabase
        .from("messages")
        .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
        .eq("channel_id", channel.id)
        .gt("created_at", since)
        .order("created_at");

      if (newMsgs && newMsgs.length > 0) {
        const existingIds = new Set(currentMsgs.map((m: any) => m.id));
        for (const msg of newMsgs) {
          if (!existingIds.has(msg.id)) {
            addMessage(channel.id, msg as any);
          }
          // Replace optimistic message with real one
          const optimistic = currentMsgs.find(
            (m: any) => m._optimistic && m.user_id === msg.user_id && m.content === msg.content
          );
          if (optimistic) {
            const updated = useChatStore.getState().messages[channel.id]
              .map((m: any) => m.id === optimistic.id ? msg : m);
            setMessages(channel.id, updated);
          }
        }
      }
    }, 3000);

    return () => {
      supabase.removeChannel(sub);
      clearInterval(pollInterval);
    };
  }, [channel.id]);

  // Load tasks when tasks tab is active (for DMs: tasks assigned to that person)
  useEffect(() => {
    if (activeTab === "tasks") {
      loadTasks();
    }
  }, [activeTab, channel.id]);

  async function loadTasks() {
    // For DMs: find cards assigned to the other person
    // For channels: find cards mentioned in the channel (or all cards in the org)
    if (channel.type === "dm") {
      // Find the other user in this DM
      const { data: members } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channel.id)
        .neq("user_id", currentUserId);

      const otherUserId = members?.[0]?.user_id;
      if (!otherUserId) return;

      const { data } = await supabase
        .from("card_assignees")
        .select("cards(*, columns(name, color), boards(name))")
        .eq("user_id", otherUserId);

      if (data) {
        const cards = data.map((d: any) => d.cards).filter(Boolean);
        setTasks(cards);
      }
    } else {
      // For group channels: show all org tasks (could filter by channel topic)
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", currentUserId)
        .limit(1)
        .single();

      if (membership) {
        const { data } = await supabase
          .from("cards")
          .select("*, columns(name, color), boards(name)")
          .eq("is_archived", false)
          .order("created_at", { ascending: false })
          .limit(20);

        if (data) setTasks(data);
      }
    }
  }

  async function sendMessage(content: string) {
    // Optimistic update — show message instantly
    const optimisticMsg = {
      id: `opt_${Date.now()}`,
      channel_id: channel.id,
      user_id: currentUserId,
      content,
      mentions: [],
      created_at: new Date().toISOString(),
      _optimistic: true,
      profiles: profileCacheRef.current[currentUserId] || null,
    };
    addMessage(channel.id, optimisticMsg as any);

    // Cache own profile if not cached yet
    if (!profileCacheRef.current[currentUserId]) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email, is_ai_agent")
        .eq("id", currentUserId)
        .single();
      if (profile) profileCacheRef.current[currentUserId] = profile;
    }

    // Insert into database
    await supabase.from("messages").insert({
      channel_id: channel.id,
      user_id: currentUserId,
      content,
      mentions: [],
    });
  }

  // Create task from chat command
  async function createTaskFromChat(title: string, boardId?: string) {
    // Find first board in the org
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", currentUserId)
      .limit(1)
      .single();

    if (!membership) return;

    let targetBoardId = boardId;
    if (!targetBoardId) {
      const { data: boards } = await supabase
        .from("boards")
        .select("id")
        .eq("org_id", membership.org_id)
        .eq("is_archived", false)
        .limit(1);
      targetBoardId = boards?.[0]?.id;
    }

    if (!targetBoardId) return;

    // Find first column (A Fazer)
    const { data: columns } = await supabase
      .from("columns")
      .select("id")
      .eq("board_id", targetBoardId)
      .order("position")
      .limit(1);

    const columnId = columns?.[0]?.id;
    if (!columnId) return;

    // Create card
    const { data: card } = await supabase
      .from("cards")
      .insert({
        column_id: columnId,
        board_id: targetBoardId,
        title,
        priority: "medium",
        created_by: currentUserId,
        position: 0,
        is_archived: false,
        metadata: {},
      })
      .select()
      .single();

    if (card) {
      // If DM, assign to the other person
      if (channel.type === "dm") {
        const { data: members } = await supabase
          .from("channel_members")
          .select("user_id")
          .eq("channel_id", channel.id)
          .neq("user_id", currentUserId);

        const otherUserId = members?.[0]?.user_id;
        if (otherUserId) {
          await supabase.from("card_assignees").insert({
            card_id: card.id,
            user_id: otherUserId,
          });
        }
      }

      // Send confirmation message in chat
      await sendMessage(`📋 Tarefa criada: **${title}**`);
    }
  }

  // Get other user ID for DMs (for task assignment default)
  const otherUserId = useMemo(() => {
    if (channel.type !== "dm") return undefined;
    const otherMsg = channelMessages.find((m: any) => m.user_id !== currentUserId);
    return otherMsg?.profiles?.id;
  }, [channel, channelMessages, currentUserId]);

  // Context menu: Create Task
  function handleContextCreateTask(messageContent: string) {
    // Use first line or first 100 chars as default title
    const firstLine = messageContent.split("\n")[0].slice(0, 100);
    setTaskDefaultTitle(firstLine);
    setTaskDefaultAssigneeId(channel.type === "dm" ? otherUserId : undefined);
    setShowTaskModal(true);
  }

  // Context menu: Email
  function handleContextEmail(messageContent: string, senderName: string) {
    setEmailContent(messageContent);
    setEmailSender(senderName);
    setShowEmailModal(true);
  }

  // Context menu: Forward
  function handleContextForward(messageContent: string, senderName: string) {
    setForwardContent(messageContent);
    setForwardSender(senderName);
    setShowForwardModal(true);
  }

  // Task modal callback
  async function handleTaskCreated(card: any, assigneeName?: string, extra?: { boardName?: string; columnName?: string }) {
    setShowTaskModal(false);
    // In DM channels, CreateTaskModal's sendTaskNotification already sends the notification
    // to this same DM, so skip sending a duplicate message here.
    if (channel.type !== "dm") {
      // Send confirmation in group/public chat (multi-line so it's expandable)
      let msg = `📋 **Tarefa criada: ${card.title}**`;
      if (assigneeName) msg += `\n👤 Atribuída a: ${assigneeName}`;
      if (extra?.boardName) msg += `\n📌 Board: ${extra.boardName}`;
      if (extra?.columnName) msg += `\n📊 Coluna: ${extra.columnName}`;
      if (card.due_date) msg += `\n📅 Prazo: ${new Date(card.due_date).toLocaleDateString("pt-BR")}`;
      await sendMessage(msg);
    }
    // Refresh tasks if on tasks tab
    if (activeTab === "tasks") loadTasks();
  }

  const headerName = channel.type === "dm"
    ? (otherUserName || channel.name)
    : channel.name;

  const tabLabel = channel.type === "dm"
    ? `Tarefas de ${otherUserName || channel.name}`
    : "Tarefas do canal";

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="border-b border-border shrink-0">
        <div className="px-4 py-2 flex items-center gap-2">
          {channel.type === "dm" ? (
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          ) : channel.type === "private" ? (
            <Lock className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Hash className="w-4 h-4 text-muted-foreground" />
          )}
          <h2 className="font-semibold text-foreground">{headerName}</h2>
          {channel.description && channel.type !== "dm" && (
            <>
              <span className="text-border">|</span>
              <p className="text-sm text-muted-foreground truncate">{channel.description}</p>
            </>
          )}
        </div>
        {/* Tabs */}
        <div className="flex px-4 gap-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "chat"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              activeTab === "tasks"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <ListTodo className="w-3.5 h-3.5" />
            {tabLabel}
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {channelMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                {channel.type === "dm" ? (
                  <MessageSquare className="w-10 h-10 text-muted-foreground mb-2" />
                ) : (
                  <Hash className="w-10 h-10 text-muted-foreground mb-2" />
                )}
                <h3 className="font-semibold text-foreground">
                  {channel.type === "dm"
                    ? `Conversa com ${headerName}`
                    : `Bem-vindo ao #${channel.name}!`}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {channel.type === "dm"
                    ? "Envie a primeira mensagem!"
                    : "Este é o início do canal. Comece a conversa!"}
                </p>
              </div>
            )}
            {channelMessages.map((msg: any, i: number) => {
              const prev = channelMessages[i - 1] as any;
              const showDateSep = !prev || isDifferentDay(prev.created_at, msg.created_at);
              const showNewMarker =
                lastReadAt &&
                prev &&
                new Date(prev.created_at).getTime() <= new Date(lastReadAt).getTime() &&
                new Date(msg.created_at).getTime() > new Date(lastReadAt).getTime() &&
                msg.user_id !== currentUserId;
              const showHeader =
                showDateSep ||
                !prev ||
                prev.user_id !== msg.user_id ||
                new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;

              return (
                <div key={msg.id}>
                  {/* Date separator */}
                  {showDateSep && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs font-medium text-muted-foreground bg-background px-2">
                        {getDateLabel(msg.created_at)}
                      </span>
                      <div className="flex-1 border-t border-border" />
                    </div>
                  )}
                  {/* New messages marker */}
                  {showNewMarker && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 border-t border-destructive" />
                      <span className="text-xs font-semibold text-destructive px-2">
                        Novo
                      </span>
                      <div className="flex-1 border-t border-destructive" />
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    showHeader={showHeader}
                    isOwn={msg.user_id === currentUserId}
                    onCreateTask={handleContextCreateTask}
                    onEmail={handleContextEmail}
                    onForward={handleContextForward}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <MessageInput
            onSend={sendMessage}
            channelName={channel.type === "dm" ? headerName : channel.name}
            onCreateTask={createTaskFromChat}
            isDM={channel.type === "dm"}
            channelId={channel.id}
            orgId={channel.org_id}
            currentUserId={currentUserId}
          />
        </>
      ) : (
        /* Tasks Tab */
        <div className="flex-1 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Kanban className="w-10 h-10 text-muted-foreground mb-2" />
              <h3 className="font-semibold text-foreground">Nenhuma tarefa</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {channel.type === "dm"
                  ? `${otherUserName || "Este usuário"} não tem tarefas atribuídas`
                  : "Nenhuma tarefa encontrada"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Use <code className="bg-muted px-1 py-0.5 rounded">/tarefa</code> no chat para criar uma
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => {
                const priority = priorityConfig[task.priority] || priorityConfig.none;
                const PriorityIcon = priority.icon;
                const isCompleted = !!task.completed_at;
                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (task.board_id) router.push(`/boards/${task.board_id}`);
                    }}
                    className={cn(
                      "bg-card border border-border rounded-xl p-3 hover:border-primary/50 transition-all cursor-pointer",
                      isCompleted && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5", isCompleted ? "text-green-500" : priority.color)}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <PriorityIcon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium text-foreground",
                          isCompleted && "line-through"
                        )}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.boards?.name && (
                            <span className="text-xs text-muted-foreground">
                              {task.boards.name}
                            </span>
                          )}
                          {task.columns?.name && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: (task.columns.color || "#6366f1") + "20",
                                color: task.columns.color || "#6366f1",
                              }}
                            >
                              {task.columns.name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={cn(
                              "text-xs",
                              new Date(task.due_date) < new Date() && !isCompleted
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}>
                              {formatDate(task.due_date)}
                            </span>
                          )}
                        </div>
                        {task.board_id && (
                          <span className="text-xs text-primary hover:underline mt-1 inline-block">
                            Abrir no board &rarr;
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Creation Modal (from context menu) */}
      {showTaskModal && (
        <CreateTaskModal
          orgId={channel.org_id}
          currentUserId={currentUserId}
          defaultTitle={taskDefaultTitle}
          defaultAssigneeId={taskDefaultAssigneeId}
          onClose={() => setShowTaskModal(false)}
          onCreated={handleTaskCreated}
        />
      )}

      {/* Forward Message Modal */}
      {showForwardModal && (
        <ForwardMessageModal
          orgId={channel.org_id}
          currentUserId={currentUserId}
          messageContent={forwardContent}
          senderName={forwardSender}
          onClose={() => setShowForwardModal(false)}
          onForwarded={() => setShowForwardModal(false)}
        />
      )}

      {/* Email Compose Modal */}
      {showEmailModal && (
        <EmailComposeModal
          defaultBody={emailContent}
          senderName={emailSender}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}
