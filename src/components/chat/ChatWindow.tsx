"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient, sendChatBroadcast, onChatBroadcast } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { CreateTaskModal } from "./CreateTaskModal";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { EmailComposeModal } from "./EmailComposeModal";
import { useChatStore } from "@/lib/stores/chat-store";
import {
  Hash, Lock, MessageSquare, ListTodo, Search,
  Kanban, CheckCircle2, Clock, AlertCircle,
  CheckSquare, Square, X, Mail, Loader2, Reply,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils/helpers";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Channel, Message } from "@/lib/types/database";

interface Props {
  channel: Channel;
  initialMessages: (Message & { profiles: any })[];
  initialHasMore?: boolean;
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

export function ChatWindow({ channel, initialMessages, initialHasMore, currentUserId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const permissions = usePermissions();
  const { messages, setMessages, addMessage, markAsRead } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const [hasMore, setHasMore] = useState(initialHasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "search">("chat");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const [replyTo, setReplyTo] = useState<(Message & { profiles: any }) | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  // Read receipts: per-member last_read_at map (user_id → timestamp)
  const [membersReadMap, setMembersReadMap] = useState<Record<string, string>>({});

  const channelMessages = messages[channel.id] || [];

  // Get the other user's name for DMs
  const otherUserName = useMemo(() => {
    if (channel.type !== "dm") return null;
    const otherMsg = channelMessages.find((m: any) => m.user_id !== currentUserId);
    return otherMsg?.profiles?.full_name || otherMsg?.profiles?.email || channel.name;
  }, [channel, channelMessages, currentUserId]);

  // Load initial data
  useEffect(() => {
    isInitialLoad.current = true;
    setMessages(channel.id, initialMessages as any);

    // Pre-cache own profile from initial messages if available
    const ownMsg = initialMessages.find((m: any) => m.user_id === currentUserId && m.profiles);
    if (ownMsg?.profiles) {
      profileCacheRef.current[currentUserId] = ownMsg.profiles;
    }

    // Run profile fetch + last_read_at fetch in parallel
    const promises: Promise<any>[] = [];

    if (!profileCacheRef.current[currentUserId]) {
      promises.push(
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, email, is_ai_agent")
          .eq("id", currentUserId)
          .single()
          .then(({ data }) => {
            if (data) profileCacheRef.current[currentUserId] = data;
          })
      );
    }

    // Get last_read_at before updating it (for "Novo" marker), then immediately update
    supabase
      .from("channel_members")
      .select("last_read_at")
      .eq("channel_id", channel.id)
      .eq("user_id", currentUserId)
      .single()
      .then(({ data }) => {
        if (data) setLastReadAt(data.last_read_at);
        // Update last_read_at after reading it
        supabase
          .from("channel_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("channel_id", channel.id)
          .eq("user_id", currentUserId)
          .then();
      });

    markAsRead(channel.id);

    // Fetch channel members (for DM other-user detection + read receipts)
    supabase
      .from("channel_members")
      .select("user_id, last_read_at")
      .eq("channel_id", channel.id)
      .then(({ data }) => {
        if (data) {
          setChannelMembers(data);
          // Read receipts: build per-member map of last_read_at
          const others = data.filter((m: any) => m.user_id !== currentUserId);
          const readMap: Record<string, string> = {};
          for (const m of others) {
            if (m.last_read_at) readMap[m.user_id] = m.last_read_at;
          }
          setMembersReadMap(readMap);
        }
      });
  }, [channel.id]);

  // Realtime subscription for read receipts: watch other members' last_read_at changes
  useEffect(() => {
    const readSub = supabase
      .channel(`read-receipts:${channel.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "channel_members",
        filter: `channel_id=eq.${channel.id}`,
      }, (payload: any) => {
        const updated = payload.new;
        if (updated.user_id !== currentUserId && updated.last_read_at) {
          setMembersReadMap((prev) => ({
            ...prev,
            [updated.user_id]: updated.last_read_at,
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(readSub); };
  }, [channel.id]);

  // Scroll to bottom — force container to absolute bottom
  useEffect(() => {
    if (activeTab !== "chat") return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const forceBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    if (isInitialLoad.current) {
      // Multiple attempts to handle images/dynamic content loading
      forceBottom();
      const t1 = setTimeout(forceBottom, 50);
      const t2 = setTimeout(forceBottom, 150);
      const t3 = setTimeout(forceBottom, 400);
      const t4 = setTimeout(() => {
        forceBottom();
        isInitialLoad.current = false;
      }, 800);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    } else if (!loadingMore) {
      // Smooth scroll for new messages
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [channelMessages.length, activeTab]);

  // Keep scrolled to bottom when images/content load and change height
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeTab !== "chat") return;

    const observer = new MutationObserver(() => {
      // Only auto-scroll if user is near bottom (within 150px)
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom < 150) {
        container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(container, { childList: true, subtree: true, attributes: true });

    // Also handle image loads
    function handleImageLoad() {
      const distFromBottom = container!.scrollHeight - container!.scrollTop - container!.clientHeight;
      if (distFromBottom < 150) {
        container!.scrollTop = container!.scrollHeight;
      }
    }
    container.addEventListener("load", handleImageLoad, { capture: true });

    return () => {
      observer.disconnect();
      container.removeEventListener("load", handleImageLoad, { capture: true });
    };
  }, [activeTab, channel.id]);

  // Load older messages when scrolling up
  async function loadOlderMessages() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const currentMsgs = useChatStore.getState().messages[channel.id] || [];
    const oldestMsg = currentMsgs[0];
    if (!oldestMsg) { setLoadingMore(false); return; }

    const res = await fetch("/api/chat/load-channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id, before: oldestMsg.created_at }),
    });

    if (res.ok) {
      const data = await res.json();
      const olderMsgs = (data.messages || []) as any[];
      if (olderMsgs.length > 0) {
        // Preserve scroll position
        const container = scrollContainerRef.current;
        const prevHeight = container?.scrollHeight || 0;

        setMessages(channel.id, [...olderMsgs, ...currentMsgs]);

        // Restore scroll position after render
        requestAnimationFrame(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - prevHeight;
          }
        });
      }
      setHasMore(data.hasMore || false);
    }

    setLoadingMore(false);
  }

  // Detect scroll to top
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeTab !== "chat") return;

    function handleScroll() {
      if (container!.scrollTop < 80 && hasMore && !loadingMore) {
        loadOlderMessages();
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingMore, activeTab, channel.id]);

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

  // Fast polling — check for new messages every 2s (primary mechanism)
  useEffect(() => {
    let active = true;

    async function pollMessages() {
      if (!active) return;
      const currentMsgs = useChatStore.getState().messages[channel.id] || [];
      const lastMsg = currentMsgs.filter((m: any) => !m._optimistic).pop();
      const since = lastMsg?.created_at || new Date(0).toISOString();

      const { data: newMsgs } = await supabase
        .from("messages")
        .select("*, profiles:user_id(id, full_name, avatar_url, email, is_ai_agent)")
        .eq("channel_id", channel.id)
        .gt("created_at", since)
        .order("created_at");

      if (!active) return;

      if (newMsgs && newMsgs.length > 0) {
        let updated = [...useChatStore.getState().messages[channel.id] || []];
        let changed = false;

        for (const msg of newMsgs) {
          if (updated.some((m: any) => m.id === msg.id)) continue;
          const optIdx = updated.findIndex(
            (m: any) => m._optimistic && m.user_id === msg.user_id && m.content === msg.content
          );
          if (optIdx >= 0) {
            updated[optIdx] = msg;
            changed = true;
          } else {
            updated.push(msg);
            changed = true;
          }
        }

        if (changed) {
          setMessages(channel.id, updated);
          supabase
            .from("channel_members")
            .update({ last_read_at: new Date().toISOString() })
            .eq("channel_id", channel.id)
            .eq("user_id", currentUserId)
            .then();
        }
      }
    }

    const pollInterval = setInterval(pollMessages, 2000);

    // Also listen for broadcast for instant delivery (when it works)
    const unsub = onChatBroadcast(async (msg: any) => {
      if (msg.channel_id !== channel.id) return;
      if (msg.user_id === currentUserId) return;
      const existing = useChatStore.getState().messages[channel.id] || [];
      if (existing.some((m: any) => m.id === msg.id || m.content === msg.content)) return;
      const enriched = await enrichMessage(msg);
      addMessage(channel.id, enriched as any);
      supabase
        .from("channel_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channel.id)
        .eq("user_id", currentUserId)
        .then();
    });

    return () => {
      active = false;
      clearInterval(pollInterval);
      unsub();
    };
  }, [channel.id]);

  // Load tasks when tasks tab is active (for DMs: tasks assigned to that person)
  useEffect(() => {
    if (activeTab === "tasks") {
      loadTasks();
    }
  }, [activeTab, channel.id]);

  async function loadTasks() {
    if (channel.type === "dm") {
      const isAdmin = permissions.isAdmin;

      if (isAdmin) {
        // Admin: show tasks of the OTHER person in the DM
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
        // Member: show only MY OWN tasks
        const { data } = await supabase
          .from("card_assignees")
          .select("cards(*, columns(name, color), boards(name))")
          .eq("user_id", currentUserId);

        if (data) {
          const cards = data.map((d: any) => d.cards).filter(Boolean);
          setTasks(cards);
        }
      }
    } else {
      // For group channels: show only MY tasks
      const { data } = await supabase
        .from("card_assignees")
        .select("cards(*, columns(name, color), boards(name))")
        .eq("user_id", currentUserId);

      if (data) {
        const cards = data.map((d: any) => d.cards).filter(Boolean).filter((c: any) => !c.is_archived);
        setTasks(cards);
      }
    }
  }

  async function sendMessage(rawContent: string) {
    // Prepend reply context if replying to a message
    let content = rawContent;
    if (replyTo) {
      const senderName = replyTo.profiles?.full_name || replyTo.profiles?.email || "Usuário";
      const truncatedContent = replyTo.content.length > 100 ? replyTo.content.slice(0, 100) + "..." : replyTo.content;
      content = `> _${senderName}: ${truncatedContent}_\n\n${rawContent}`;
      setReplyTo(null);
    }

    // Optimistic update — show message instantly (non-blocking)
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

    // Broadcast IMMEDIATELY (before DB insert) for instant delivery to other users
    sendChatBroadcast({
      id: optimisticMsg.id,
      channel_id: channel.id,
      user_id: currentUserId,
      content,
      mentions: [],
      created_at: optimisticMsg.created_at,
    });

    // Fire-and-forget: DB insert + profile cache (non-blocking)
    (async () => {
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
      } as any);
    })().catch(() => {});

    // Sending a message means user has read everything — update last_read_at
    supabase
      .from("channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channel.id)
      .eq("user_id", currentUserId)
      .then();
  }

  // Create task from chat command
  async function createTaskFromChat(title: string, boardId?: string) {
    // In DM 1-on-1: find boards where the OTHER user is a member
    const isDm = channel.type === "dm";
    const targetUser = isDm ? otherUserId : currentUserId;

    let targetBoardId = boardId;
    if (!targetBoardId && targetUser) {
      // Get boards where target user is a member
      const { data: memberBoards } = await supabase
        .from("board_members")
        .select("board_id, boards:board_id(id, name, is_archived, org_id)")
        .eq("user_id", targetUser);

      const validBoard = memberBoards?.find(
        (mb: any) => mb.boards && !mb.boards.is_archived && mb.boards.org_id === channel.org_id
      );
      targetBoardId = (validBoard as any)?.boards?.id;
    }

    if (!targetBoardId) {
      // Fallback: any board in the org
      const { data: boards } = await supabase
        .from("boards")
        .select("id")
        .eq("org_id", channel.org_id)
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
        priority: "none",
        created_by: currentUserId,
        position: 0,
        is_archived: false,
        metadata: {},
      })
      .select()
      .single();

    if (card) {
      // Log activity: card created from /tarefa command
      await supabase.from("activity_logs").insert({
        card_id: card.id,
        user_id: currentUserId,
        action: "created",
        details: { title, source: "chat_command" },
      });

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

      // Mirror to hub boards (fire-and-forget)
      fetch("/api/cards/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: card.id, board_id: targetBoardId }),
      }).catch(() => {});

      // Sync to Google Calendar if card has due_date (fire-and-forget)
      if ((card as any).due_date) {
        fetch("/api/cards/gcal-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id }),
        }).catch(() => {});
      }

      // Send confirmation message in chat
      await sendMessage(`📋 Tarefa criada: **${title}**`);
    }
  }

  // Get other user ID for DMs (for task assignment default)
  const otherUserId = useMemo(() => {
    if (channel.type !== "dm") return undefined;
    // Try from channel members first (more reliable)
    const otherMember = channelMembers?.find((m: any) => m.user_id !== currentUserId);
    if (otherMember) return otherMember.user_id;
    // Fallback: from messages
    const otherMsg = channelMessages.find((m: any) => m.user_id !== currentUserId);
    return otherMsg?.profiles?.id;
  }, [channel, channelMembers, channelMessages, currentUserId]);

  // Selection mode
  function toggleSelect(msgId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkEmail() {
    const selected = channelMessages.filter((m: any) => selectedIds.has(m.id));
    const body = selected
      .map((m: any) => {
        const name = m.profiles?.full_name || "Desconhecido";
        const time = new Date(m.created_at).toLocaleString("pt-BR");
        return `[${name} - ${time}]\n${m.content}`;
      })
      .join("\n\n---\n\n");
    setEmailContent(body);
    setEmailSender(channel.type === "dm" ? headerName : `#${channel.name}`);
    setShowEmailModal(true);
    exitSelectMode();
  }

  // Context menu: Create Task
  function handleContextCreateTask(messageContent: string) {
    // Pass full content (CreateTaskModal will detect files and extract title)
    setTaskDefaultTitle(messageContent);
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
    ? permissions.isAdmin
      ? `Tarefas de ${otherUserName || channel.name}`
      : "Minhas Tarefas"
    : "Minhas Tarefas";

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
          <button
            onClick={() => { setActiveTab("search"); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              activeTab === "search"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Search className="w-3.5 h-3.5" />
            Buscar
          </button>
          <div className="flex-1" />
          {activeTab === "chat" && channelMessages.length > 0 && !selectMode && (
            <button
              onClick={() => setSelectMode(true)}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer flex items-center gap-1"
              title="Selecionar mensagens"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Selecionar
            </button>
          )}
          {selectMode && (
            <button
              onClick={() => { setSelectedIds(new Set(channelMessages.map((m: any) => m.id))); }}
              className="px-2 py-1 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              Selecionar todas
            </button>
          )}
        </div>
      </div>

      {activeTab === "chat" ? (
        <>
          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Load more indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Carregando mensagens anteriores...</span>
              </div>
            )}
            {hasMore && !loadingMore && channelMessages.length > 0 && (
              <div className="flex items-center justify-center py-2">
                <button
                  onClick={loadOlderMessages}
                  className="text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer"
                >
                  Carregar mensagens anteriores
                </button>
              </div>
            )}
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
                  <div className={cn("flex items-start gap-2", selectMode && "group/select")}>
                    {selectMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(msg.id); }}
                        className="mt-2 shrink-0 cursor-pointer"
                      >
                        {selectedIds.has(msg.id) ? (
                          <CheckSquare className="w-4.5 h-4.5 text-primary" />
                        ) : (
                          <Square className="w-4.5 h-4.5 text-muted-foreground hover:text-foreground transition-colors" />
                        )}
                      </button>
                    )}
                    <div className="flex-1">
                      <MessageBubble
                        message={msg}
                        showHeader={showHeader}
                        isOwn={msg.user_id === currentUserId}
                        isRead={(() => {
                          if (msg.user_id !== currentUserId) return false;
                          const others = Object.values(membersReadMap);
                          if (others.length === 0) return false;
                          return others.every((ts) => msg.created_at <= ts);
                        })()}
                        readBy={msg.user_id === currentUserId ? Object.values(membersReadMap).filter((ts) => msg.created_at <= ts).length : 0}
                        totalOthers={Object.keys(membersReadMap).length}
                        onCreateTask={handleContextCreateTask}
                        onEmail={handleContextEmail}
                        onForward={handleContextForward}
                        onReply={(m) => { setReplyTo(m); setFocusTrigger(t => t + 1); }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Selection action bar */}
          {selectMode && (
            <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-t border-primary/20">
              <span className="text-sm text-foreground font-medium">
                {selectedIds.size} {selectedIds.size === 1 ? "mensagem selecionada" : "mensagens selecionadas"}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleBulkEmail}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                Enviar por e-mail
              </button>
              <button
                onClick={exitSelectMode}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
            </div>
          )}

          {/* Input */}
          {!selectMode && (
          <>
          {replyTo && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t border-border">
              <Reply className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                <span className="font-semibold text-foreground">
                  {replyTo.profiles?.full_name || replyTo.profiles?.email || "Usuário"}
                </span>
                {": "}
                {replyTo.content.length > 80 ? replyTo.content.slice(0, 80) + "..." : replyTo.content}
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <MessageInput
            onSend={sendMessage}
            channelName={channel.type === "dm" ? headerName : channel.name}
            onCreateTask={createTaskFromChat}
            isDM={channel.type === "dm"}
            channelId={channel.id}
            orgId={channel.org_id}
            currentUserId={currentUserId}
            focusTrigger={focusTrigger}
          />
          </>
          )}
        </>
      ) : activeTab === "tasks" ? (
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
      ) : (
        /* Search Tab */
        <div className="flex flex-col h-full">
          <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar no chat..."
                className="w-full pl-9 pr-8 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchQuery.trim() && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {channelMessages.filter((m: any) => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} resultado(s)
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {!searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Search className="w-10 h-10 text-muted-foreground mb-2" />
                <h3 className="font-semibold text-foreground">Buscar no chat</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Digite para buscar mensagens nesta conversa
                </p>
              </div>
            ) : (() => {
              const filtered = channelMessages.filter((m: any) =>
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
              );
              if (filtered.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Search className="w-10 h-10 text-muted-foreground mb-2" />
                    <h3 className="font-semibold text-foreground">Nenhum resultado</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Nenhuma mensagem contém &quot;{searchQuery}&quot;
                    </p>
                  </div>
                );
              }
              return filtered.map((msg: any, i: number) => {
                const prev = filtered[i - 1] as any;
                const showDateSep = !prev || isDifferentDay(prev.created_at, msg.created_at);
                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 border-t border-border" />
                        <span className="text-xs font-medium text-muted-foreground bg-background px-2">
                          {getDateLabel(msg.created_at)}
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      showHeader={true}
                      isOwn={msg.user_id === currentUserId}
                      isRead={false}
                      readBy={0}
                      totalOthers={0}
                      onCreateTask={handleContextCreateTask}
                      onEmail={handleContextEmail}
                      onForward={handleContextForward}
                      onReply={(m) => { setActiveTab("chat"); setReplyTo(m); setFocusTrigger(t => t + 1); }}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Task Creation Modal (from context menu) */}
      {showTaskModal && (
        <CreateTaskModal
          orgId={channel.org_id}
          currentUserId={currentUserId}
          defaultTitle={taskDefaultTitle}
          defaultAssigneeId={taskDefaultAssigneeId}
          targetUserId={channel.type === "dm" ? otherUserId : undefined}
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
