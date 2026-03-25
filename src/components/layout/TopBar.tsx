"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Menu, Search, Loader2, MessageSquare, CheckSquare, User, Check, ExternalLink } from "lucide-react";
import { useNotificationStore, type NotificationItem } from "@/lib/stores/notification-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { getInitials, generateColor } from "@/lib/utils/helpers";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile | null;
}

interface MessageResult {
  id: string;
  content: string;
  channel_id: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

interface CardResult {
  id: string;
  title: string;
  board_id: string;
  priority: string | null;
  due_date: string | null;
}

interface MemberResult {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface SearchResults {
  messages: MessageResult[];
  cards: CardResult[];
  members: MemberResult[];
}

export function TopBar({ profile }: TopBarProps) {
  const { toggleSidebar, activeOrgId } = useUIStore();
  const router = useRouter();
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ messages: [], cards: [], members: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasResults = results.messages.length > 0 || results.cards.length > 0 || results.members.length > 0;

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim() || searchQuery.trim().length < 2) {
        setResults({ messages: [], cards: [], members: [] });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const pattern = `%${searchQuery.trim()}%`;

        const [messagesRes, cardsRes, membersRes] = await Promise.all([
          supabase
            .from("messages")
            .select("id, content, channel_id, created_at, profiles:user_id(full_name)")
            .ilike("content", pattern)
            .limit(5),
          supabase
            .from("cards")
            .select("id, title, board_id, priority, due_date")
            .ilike("title", pattern)
            .eq("is_archived", false)
            .limit(5),
          supabase
            .from("profiles")
            .select("id, full_name, email, avatar_url")
            .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
            .limit(5),
        ]);

        setResults({
          messages: (messagesRes.data as MessageResult[]) || [],
          cards: (cardsRes.data as CardResult[]) || [],
          members: (membersRes.data as MemberResult[]) || [],
        });
      } catch (err) {
        console.error("Erro na busca global:", err);
        setResults({ messages: [], cards: [], members: [] });
      } finally {
        setIsLoading(false);
      }
    },
    [supabase]
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults({ messages: [], cards: [], members: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleNavigateMessage(channelId: string) {
    setIsOpen(false);
    setQuery("");
    router.push(`/chat/${channelId}`);
  }

  function handleNavigateCard(boardId: string) {
    setIsOpen(false);
    setQuery("");
    router.push(`/boards/${boardId}`);
  }

  async function handleNavigateMember(memberId: string) {
    if (!activeOrgId || !profile?.id) return;

    setIsOpen(false);
    setQuery("");

    // Check if a DM channel already exists with this member
    const { data: existingChannels } = await supabase
      .from("channel_members")
      .select("channel_id, channels!inner(id, type)")
      .eq("user_id", memberId)
      .eq("channels.type", "dm");

    if (existingChannels && existingChannels.length > 0) {
      // Find a DM channel where the current user is also a member
      for (const ch of existingChannels) {
        const { data: myMembership } = await supabase
          .from("channel_members")
          .select("channel_id")
          .eq("channel_id", ch.channel_id)
          .eq("user_id", profile.id)
          .single();

        if (myMembership) {
          router.push(`/chat/${ch.channel_id}`);
          return;
        }
      }
    }

    // Create new DM channel
    const targetMember = results.members.find((m) => m.id === memberId);
    const dmName = targetMember?.full_name || targetMember?.email || "DM";

    const { data: channel } = await supabase
      .from("channels")
      .insert({
        org_id: activeOrgId,
        name: dmName,
        type: "dm",
        created_by: profile.id,
        is_archived: false,
      })
      .select()
      .single();

    if (channel) {
      const now = new Date().toISOString();
      await supabase.from("channel_members").insert([
        { channel_id: channel.id, user_id: profile.id, last_read_at: now, notifications: "all" },
        { channel_id: channel.id, user_id: memberId, last_read_at: now, notifications: "all" },
      ]);
      router.push(`/chat/${channel.id}`);
    }
  }

  function truncate(text: string, maxLen: number) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "...";
  }

  return (
    <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
      <button
        onClick={toggleSidebar}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 flex items-center gap-2 max-w-md" ref={containerRef}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setIsOpen(true);
            }}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />

          {/* Search Dropdown */}
          {isOpen && query.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">Buscando...</span>
                </div>
              )}

              {!isLoading && !hasResults && (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  Nenhum resultado encontrado
                </div>
              )}

              {!isLoading && hasResults && (
                <div>
                  {/* Messages */}
                  {results.messages.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-b border-border/50 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Mensagens
                      </div>
                      {results.messages.map((msg) => (
                        <button
                          key={msg.id}
                          onClick={() => handleNavigateMessage(msg.channel_id)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-gray-50 last:border-b-0"
                        >
                          <p className="text-sm text-foreground truncate">
                            {truncate(msg.content, 80)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {msg.profiles?.full_name || "Desconhecido"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Cards/Tasks */}
                  {results.cards.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-b border-border/50 flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5" />
                        Tarefas
                      </div>
                      {results.cards.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => handleNavigateCard(card.board_id)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-gray-50 last:border-b-0"
                        >
                          <p className="text-sm text-foreground truncate">
                            {truncate(card.title, 80)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {card.priority && (
                              <span className="text-xs text-muted-foreground capitalize">{card.priority}</span>
                            )}
                            {card.due_date && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(card.due_date).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Members */}
                  {results.members.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-b border-border/50 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Membros
                      </div>
                      {results.members.map((member) => (
                        <button
                          key={member.id}
                          onClick={() => handleNavigateMember(member.id)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-gray-50 last:border-b-0 flex items-center gap-2"
                        >
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{
                                backgroundColor: generateColor(
                                  member.full_name || member.email || "U"
                                ),
                              }}
                            >
                              {getInitials(member.full_name || member.email || "U")}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {member.full_name || member.email}
                            </p>
                            {member.full_name && (
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Logo Lesco */}
        <img src="/lesco-logo.png" alt="Lesco" className="h-7" />

        <NotificationBell />
        <Link
          href="/settings/profile"
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          style={{ backgroundColor: generateColor(profile?.full_name || profile?.email || "U") }}
          title="Meu Perfil"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            getInitials(profile?.full_name || profile?.email || "U")
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
        </Link>
      </div>
    </header>
  );
}

function NotificationBell() {
  const router = useRouter();
  const { unreadCount, recentNotifications, dropdownOpen, setDropdownOpen, resetUnread } =
    useNotificationStore();
  const supabase = createClient();
  const bellRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, setDropdownOpen]);

  async function markAllRead() {
    const { activeOrgId } = useUIStore.getState();
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId || !activeOrgId) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("org_id", activeOrgId)
      .eq("is_read", false);

    resetUnread();
    useNotificationStore.getState().setRecentNotifications(
      recentNotifications.map((n) => ({ ...n, is_read: true }))
    );
  }

  function handleClick(notif: NotificationItem) {
    setDropdownOpen(false);
    if (notif.link) {
      router.push(notif.link);
    } else {
      router.push("/notifications");
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative text-muted-foreground hover:text-foreground transition-colors p-1.5 cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Marcar como lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            ) : (
              recentNotifications.slice(0, 8).map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-accent transition-colors cursor-pointer border-b border-border/50 last:border-b-0 flex items-start gap-3 ${
                    !notif.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  {!notif.is_read && (
                    <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">{notif.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{notif.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {timeAgo(notif.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2">
            <button
              onClick={() => {
                setDropdownOpen(false);
                router.push("/notifications");
              }}
              className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center justify-center gap-1 py-1"
            >
              Ver todas
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
