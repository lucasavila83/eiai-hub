"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare, Kanban, Bell, Settings, Calendar, BarChart3, Zap, Plug, Workflow,
  Hash, Lock, ChevronDown, ChevronRight, ChevronLeft,
  Plus, LogOut, X, Loader2, Users, MessageCircle, Check,
  MoreHorizontal, Trash2, EyeOff, UserCog,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import { useChatStore } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Profile, Organization, Channel } from "@/lib/types/database";
import { playNotificationSound, unlockAudio } from "@/lib/utils/notification-sound";
import { useNotificationStore } from "@/lib/stores/notification-store";

interface SidebarProps {
  profile: Profile | null;
  organizations: Organization[];
}

export function Sidebar({ profile, organizations }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { channels, setChannels, unreadCounts, setUnreadCount, incrementUnread } = useChatStore();
  const { sidebarOpen, setSidebarOpen, toggleSidebar, setActiveOrgId } = useUIStore();
  const addToast = useNotificationStore((s) => s.addToast);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(
    organizations[0] || null
  );
  const [dmChannels, setDmChannels] = useState<(Channel & { otherUser?: any })[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateDM, setShowCreateDM] = useState(false);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Channel settings modal state
  const [channelSettingsTarget, setChannelSettingsTarget] = useState<Channel | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "channel" | "dm";
    item: any;
  } | null>(null);

  // Close context menu on click anywhere
  useEffect(() => {
    function handleClick() {
      setContextMenu(null);
    }
    if (contextMenu) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (activeOrg) {
      setActiveOrgId(activeOrg.id);
      loadChannels(activeOrg.id);
      loadDMs(activeOrg.id);
      loadOrgMembers(activeOrg.id);
    }
  }, [activeOrg]);

  // Load unread counts (batched — all channels in parallel, max 10 concurrent)
  const loadUnreadCounts = useCallback(async () => {
    if (!profile) return;
    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", profile.id);

    if (!memberships || memberships.length === 0) return;

    // Batch in groups of 10 to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < memberships.length; i += batchSize) {
      const batch = memberships.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((m: any) => {
          let query = supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", m.channel_id)
            .neq("user_id", profile.id);
          // If last_read_at is null, count ALL messages from others
          if (m.last_read_at) {
            query = query.gt("created_at", m.last_read_at);
          }
          return query.then((res) => ({ channelId: m.channel_id, count: res.count || 0 }));
        })
      );
      results.forEach(({ channelId, count }) => setUnreadCount(channelId, count));
    }
  }, [profile]);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Refs to avoid stale closures in realtime callbacks
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  const dmChannelsRef = useRef(dmChannels);
  useEffect(() => { dmChannelsRef.current = dmChannels; }, [dmChannels]);
  const channelsRef = useRef(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  const orgMembersRef = useRef(orgMembers);
  useEffect(() => { orgMembersRef.current = orgMembers; }, [orgMembers]);

  // Single consolidated realtime subscription for sidebar
  useEffect(() => {
    if (!activeOrg || !profile) return;

    const sub = supabase
      .channel("sidebar-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, async (payload: any) => {
        const msg = payload.new;
        if (msg.user_id !== profile.id) {
          // Use ref to get current pathname (not stale closure)
          const isViewingChannel = pathnameRef.current.includes(msg.channel_id);
          if (!isViewingChannel) {
            incrementUnread(msg.channel_id);
            playNotificationSound();

            // Show toast popup with sender info
            const dm = dmChannelsRef.current.find((d) => d.id === msg.channel_id);
            const ch = channelsRef.current.find((c) => c.id === msg.channel_id);
            const member = orgMembersRef.current.find((m: any) => m.user_id === msg.user_id);
            const senderProfile = member?.profiles;
            const senderName = senderProfile?.full_name || senderProfile?.email || "Alguém";
            const channelName = dm ? senderName : ch?.name || "";
            const content = (msg.content || "").replace(/\*\*/g, "").replace(/\n/g, " ").slice(0, 100);

            addToast({
              title: senderName,
              body: dm ? content : `#${channelName}: ${content}`,
              link: `/chat/${msg.channel_id}`,
              senderAvatar: senderProfile?.avatar_url || null,
            });
          }
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "org_members",
        filter: `org_id=eq.${activeOrg.id}`,
      }, () => {
        loadOrgMembers(activeOrg.id);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "channels",
        filter: `org_id=eq.${activeOrg.id}`,
      }, () => {
        loadChannels(activeOrg.id);
        loadDMs(activeOrg.id);
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "channel_members",
      }, (payload: any) => {
        const cm = payload.new;
        if (cm.user_id === profile.id) {
          loadChannels(activeOrg.id);
          loadDMs(activeOrg.id);
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Retry subscription after a brief delay
          setTimeout(() => {
            sub.subscribe();
          }, 3000);
        }
      });

    return () => { supabase.removeChannel(sub); };
  }, [activeOrg, profile]);

  // Unlock Web Audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio();
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  async function loadChannels(orgId: string) {
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_archived", false)
      .in("type", ["public", "private"])
      .order("name");
    if (data) setChannels(data);
  }

  async function loadDMs(orgId: string) {
    if (!profile) return;

    // First get channel IDs where current user is a member
    const { data: myChannelMembers } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", profile.id);

    if (!myChannelMembers || myChannelMembers.length === 0) {
      setDmChannels([]);
      return;
    }

    const myChannelIds = myChannelMembers.map((cm: any) => cm.channel_id);

    // Then load only DM channels the user belongs to
    const { data } = await supabase
      .from("channels")
      .select("*, channel_members(user_id, profiles:user_id(id, full_name, avatar_url, email, status))")
      .eq("org_id", orgId)
      .eq("type", "dm")
      .eq("is_archived", false)
      .in("id", myChannelIds);

    if (data) {
      const enriched = data.map((ch: any) => {
        const otherMember = ch.channel_members?.find(
          (m: any) => m.user_id !== profile.id
        );
        return {
          ...ch,
          otherUser: otherMember?.profiles || null,
        };
      });
      setDmChannels(enriched);
    }
  }

  async function loadOrgMembers(orgId: string) {
    const { data } = await supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email, status)")
      .eq("org_id", orgId);
    if (data) setOrgMembers(data);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleArchiveDM(dmId: string) {
    await supabase.from("channels").update({ is_archived: true }).eq("id", dmId);
    setDmChannels((prev) => prev.filter((dm) => dm.id !== dmId));
    if (pathname === `/chat/${dmId}`) {
      router.push("/chat");
    }
  }

  async function handleDeleteChannel(channelId: string) {
    // Delete channel members first, then channel
    await supabase.from("channel_members").delete().eq("channel_id", channelId);
    await supabase.from("messages").delete().eq("channel_id", channelId);
    await supabase.from("channels").delete().eq("id", channelId);
    setChannels(channels.filter((ch) => ch.id !== channelId));
    if (pathname === `/chat/${channelId}`) {
      router.push("/chat");
    }
  }

  // Channel context menu
  function handleChannelContextMenu(e: React.MouseEvent, channel: Channel) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: "channel", item: channel });
  }

  // DM context menu
  function handleDMContextMenu(e: React.MouseEvent, dm: Channel & { otherUser?: any }) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: "dm", item: dm });
  }

  const perms = usePermissions();

  const allNavItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat", visible: true },
    { href: "/boards", icon: Kanban, label: "Boards", visible: true },
    { href: "/processes", icon: Workflow, label: "Processos", visible: perms.processes.view || perms.isAdmin },
    { href: "/calendar", icon: Calendar, label: "Calendário", visible: perms.canViewCalendar },
    { href: "/dashboard", icon: BarChart3, label: "Dashboard", visible: perms.canViewDashboard || perms.isAdmin },
    { href: "/automations", icon: Zap, label: "Automações", visible: perms.canManageAutomations || perms.isAdmin },
    { href: "/integrations", icon: Plug, label: "Integrações", visible: perms.canManageIntegrations || perms.isAdmin },
    { href: "/notifications", icon: Bell, label: "Notificações", visible: true },
    { href: "/settings", icon: Settings, label: "Configurações", visible: perms.canAccessSettings || perms.isAdmin },
  ];

  const navItems = allNavItems.filter((item) => item.visible);

  // Icon bar hover expand (1st column overlay with labels)
  const [iconBarExpanded, setIconBarExpanded] = useState(false);
  const iconBarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleIconBarEnter() {
    if (iconBarTimeoutRef.current) {
      clearTimeout(iconBarTimeoutRef.current);
      iconBarTimeoutRef.current = null;
    }
    setIconBarExpanded(true);
  }

  function handleIconBarLeave() {
    if (iconBarTimeoutRef.current) clearTimeout(iconBarTimeoutRef.current);
    iconBarTimeoutRef.current = setTimeout(() => {
      setIconBarExpanded(false);
    }, 200);
  }

  return (
    <div ref={sidebarRef} className="relative flex h-full shrink-0">
      {/* ===== 1st COLUMN: Icon bar (always visible w-14) + hover overlay with labels ===== */}
      <div
        className="relative z-30 shrink-0"
        onMouseEnter={handleIconBarEnter}
        onMouseLeave={handleIconBarLeave}
      >
        {/* Narrow icon strip */}
        <div className="w-14 h-full bg-card border-r border-border flex flex-col items-center py-3">
          {/* Lesco Icon */}
          <div className="mb-4">
            <Image
              src="/lesco-icon.png"
              alt="Lesco"
              width={32}
              height={32}
              className="w-8 h-8 rounded"
            />
          </div>

          {/* Nav Icons */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {navItems.map(({ href, icon: Icon, label }) => {
              const hasUnread = href === "/chat" && Object.values(unreadCounts).some(c => c > 0);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                    pathname.startsWith(href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  title={label}
                >
                  <Icon className="w-5 h-5" />
                  {hasUnread && !pathname.startsWith(href) && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom: logout only */}
          <div className="mt-auto flex flex-col items-center gap-2">
            <button
              onClick={handleLogout}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hover overlay: expanded icon bar with labels (like ClickUp) */}
        <div
          className={cn(
            "absolute top-0 left-0 h-full bg-card border-r border-border shadow-xl flex flex-col py-3 transition-all duration-200 ease-in-out overflow-hidden",
            iconBarExpanded ? "w-48 opacity-100" : "w-0 opacity-0 pointer-events-none"
          )}
        >
          <div className="w-48 h-full flex flex-col">
            {/* Lesco Icon + name */}
            <div className="flex items-center gap-2.5 px-3 mb-4">
              <Image
                src="/lesco-icon.png"
                alt="Lesco"
                width={32}
                height={32}
                className="w-8 h-8 rounded shrink-0"
              />
              <span className="text-sm font-bold text-foreground">Lesco</span>
            </div>

            {/* Nav items with labels */}
            <nav className="flex flex-col gap-0.5 px-2 flex-1">
              {navItems.map(({ href, icon: Icon, label }) => {
                const hasUnread = href === "/chat" && Object.values(unreadCounts).some(c => c > 0);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIconBarExpanded(false)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname.startsWith(href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{label}</span>
                    {hasUnread && !pathname.startsWith(href) && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Bottom: logout */}
            <div className="mt-auto px-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 2nd COLUMN: Content panel (ALWAYS FIXED when sidebarOpen) ===== */}
      {sidebarOpen && (
        <div className="w-56 bg-muted border-r border-border flex flex-col h-full shrink-0 z-10">
          {/* Header: Org Switcher + Collapse button */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1 rounded-lg hover:bg-accent cursor-pointer">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: generateColor(activeOrg?.name || "X") }}
                >
                  {getInitials(activeOrg?.name || "?")}
                </div>
                <span className="flex-1 text-sm font-semibold text-foreground truncate">
                  {activeOrg?.name || "Selecione org"}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
              {/* Collapse button «  */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                title="Fechar barra lateral"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Channels + DMs */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* Canais section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Canais
                </span>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="hover:text-foreground text-muted-foreground hover:bg-accent rounded-md p-0.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-0.5">
                {channels.map((channel) => {
                  const isActive = pathname === `/chat/${channel.id}`;
                  const unread = unreadCounts[channel.id] || 0;
                  return (
                    <div
                      key={channel.id}
                      className="group/channel relative"
                      onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                    >
                      <Link
                        href={`/chat/${channel.id}`}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : unread > 0
                            ? "text-foreground font-semibold hover:bg-accent"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                      >
                        {channel.type === "private" ? (
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Hash className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="flex-1 truncate">{channel.name}</span>
                        {unread > 0 && !isActive && (
                          <div className="flex items-center gap-1 shrink-0">
                            <MessageSquare className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
                            <span className="bg-pink-500 text-white text-[10px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold px-1">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          </div>
                        )}
                      </Link>
                      {/* Hover settings icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setChannelSettingsTarget(channel);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover/channel:opacity-100 transition-opacity"
                        title="Configurações do canal"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mensagens Diretas section */}
            <div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Mensagens diretas
                </span>
                <button
                  onClick={() => setShowCreateDM(true)}
                  className="hover:text-foreground text-muted-foreground hover:bg-accent rounded-md p-0.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-0.5">
                {dmChannels.map((dm) => {
                  const isActive = pathname === `/chat/${dm.id}`;
                  const unread = unreadCounts[dm.id] || 0;
                  const user = dm.otherUser;
                  const name = user?.full_name || user?.email || "Usuário";
                  const isOnline = user?.status === "online";
                  return (
                    <Link
                      key={dm.id}
                      href={`/chat/${dm.id}`}
                      onContextMenu={(e) => handleDMContextMenu(e, dm)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : unread > 0
                          ? "text-foreground font-semibold hover:bg-accent"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <div className="relative shrink-0">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ backgroundColor: generateColor(name) }}
                          >
                            {getInitials(name)}
                          </div>
                        )}
                        <div
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-50",
                            isOnline ? "bg-green-500" : "bg-gray-400"
                          )}
                        />
                      </div>
                      <span className="flex-1 truncate">{name}</span>
                      {unread > 0 && !isActive && (
                        <div className="flex items-center gap-1 shrink-0">
                          <MessageSquare className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
                          <span className="bg-pink-500 text-white text-[10px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold px-1">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })}
                {dmChannels.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Nenhuma conversa ainda
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Expand button when content panel is collapsed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-3 left-[60px] z-20 w-6 h-6 flex items-center justify-center rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
          title="Abrir barra lateral"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "channel" && (
            <>
              <button
                onClick={() => {
                  setChannelSettingsTarget(contextMenu.item);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <UserCog className="w-4 h-4" />
                Gerenciar membros
              </button>
              <button
                onClick={() => {
                  const channel = contextMenu.item;
                  setContextMenu(null);
                  if (window.confirm(`Tem certeza que deseja deletar o canal #${channel.name}? Esta ação não pode ser desfeita.`)) {
                    handleDeleteChannel(channel.id);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Deletar canal
              </button>
            </>
          )}
          {contextMenu.type === "dm" && (
            <button
              onClick={() => {
                handleArchiveDM(contextMenu.item.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <EyeOff className="w-4 h-4" />
              Ocultar conversa
            </button>
          )}
        </div>
      )}

      {/* Channel Settings Modal */}
      {channelSettingsTarget && (
        <ChannelSettingsModal
          channel={channelSettingsTarget}
          orgMembers={orgMembers}
          currentUserId={profile?.id || ""}
          onClose={() => setChannelSettingsTarget(null)}
          onDeleted={(channelId) => {
            handleDeleteChannel(channelId);
            setChannelSettingsTarget(null);
          }}
          onMembersUpdated={() => {
            if (activeOrg) loadChannels(activeOrg.id);
          }}
        />
      )}

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <CreateChannelModal
          orgId={activeOrg?.id || ""}
          orgMembers={orgMembers}
          currentUserId={profile?.id || ""}
          onClose={() => setShowCreateChannel(false)}
          onCreated={(ch) => {
            setChannels([...channels, ch]);
            setShowCreateChannel(false);
            router.push(`/chat/${ch.id}`);
          }}
        />
      )}

      {/* Create DM Modal */}
      {showCreateDM && (
        <CreateDMModal
          orgId={activeOrg?.id || ""}
          members={orgMembers}
          currentUserId={profile?.id || ""}
          existingDMs={dmChannels}
          onClose={() => setShowCreateDM(false)}
          onCreated={(ch) => {
            setShowCreateDM(false);
            router.push(`/chat/${ch.id}`);
            loadDMs(activeOrg?.id || "");
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Channel Settings Modal (Manage Members + Delete)
// ============================================================
function ChannelSettingsModal({
  channel,
  orgMembers,
  currentUserId,
  onClose,
  onDeleted,
  onMembersUpdated,
}: {
  channel: Channel;
  orgMembers: any[];
  currentUserId: string;
  onClose: () => void;
  onDeleted: (channelId: string) => void;
  onMembersUpdated: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channelMembers, setChannelMembers] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadChannelMembers();
  }, [channel.id]);

  async function loadChannelMembers() {
    setLoading(true);
    const { data } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channel.id);
    if (data) {
      setChannelMembers(new Set(data.map((m: any) => m.user_id)));
    }
    setLoading(false);
  }

  function toggleMember(userId: string) {
    setChannelMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function selectAll() {
    setChannelMembers(new Set(orgMembers.map((m: any) => m.user_id)));
  }

  function deselectAll() {
    // Keep at least the current user
    setChannelMembers(new Set([currentUserId]));
  }

  const allSelected = orgMembers.length > 0 && orgMembers.every((m: any) => channelMembers.has(m.user_id));

  async function handleSaveMembers() {
    setSaving(true);
    // Get current members from DB
    const { data: existing } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channel.id);

    const existingIds = new Set((existing || []).map((m: any) => m.user_id));
    const targetIds = channelMembers;

    // Members to add
    const toAdd = Array.from(targetIds).filter((id) => !existingIds.has(id));
    // Members to remove
    const toRemove = Array.from(existingIds).filter((id) => !targetIds.has(id));

    const now = new Date().toISOString();
    if (toAdd.length > 0) {
      await supabase.from("channel_members").insert(
        toAdd.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          last_read_at: now,
          notifications: "all" as const,
        }))
      );
    }

    if (toRemove.length > 0) {
      for (const userId of toRemove) {
        await supabase
          .from("channel_members")
          .delete()
          .eq("channel_id", channel.id)
          .eq("user_id", userId);
      }
    }

    setSaving(false);
    onMembersUpdated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            {channel.type === "private" ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
            {channel.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member management */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4 text-muted-foreground" />
              Gerenciar membros
            </label>
            <button
              type="button"
              onClick={allSelected ? deselectAll : selectAll}
              className="text-xs text-primary hover:text-primary/80 font-medium"
            >
              {allSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border border-input rounded-lg max-h-48 overflow-y-auto">
              {orgMembers.map((m: any) => {
                const p = m.profiles;
                const memberName = p?.full_name || p?.email || "?";
                const isChecked = channelMembers.has(m.user_id);
                return (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer border-b border-input last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMember(m.user_id)}
                      className="rounded border-input shrink-0"
                    />
                    <div className="relative shrink-0">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt={memberName} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: generateColor(memberName) }}
                        >
                          {getInitials(memberName)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {memberName}
                        {m.user_id === currentUserId && (
                          <span className="text-xs text-muted-foreground ml-1">(você)</span>
                        )}
                      </p>
                      {p?.email && (
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {channelMembers.size} membro{channelMembers.size !== 1 ? "s" : ""} selecionado{channelMembers.size !== 1 ? "s" : ""}
          </p>

          <button
            onClick={handleSaveMembers}
            disabled={saving}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar membros
          </button>
        </div>

        {/* Delete channel */}
        <div className="border-t border-border pt-4">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Deletar canal
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-600 text-center">
                Tem certeza? Todas as mensagens serão perdidas.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-foreground border border-border hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onDeleted(channel.id)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Create Channel Modal
// ============================================================
function CreateChannelModal({
  orgId,
  orgMembers,
  currentUserId,
  onClose,
  onCreated,
}: {
  orgId: string;
  orgMembers: any[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set([currentUserId])
  );
  const supabase = createClient();

  function toggleMember(userId: string) {
    if (userId === currentUserId) return;
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function selectAll() {
    const allIds = orgMembers.map((m: any) => m.user_id);
    setSelectedMembers(new Set(allIds));
  }

  function deselectAll() {
    setSelectedMembers(new Set([currentUserId]));
  }

  const allSelected = orgMembers.length > 0 && orgMembers.every((m: any) => selectedMembers.has(m.user_id));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const user = (await supabase.auth.getUser()).data.user;
    const { data, error } = await supabase
      .from("channels")
      .insert({
        org_id: orgId,
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || null,
        type: isPrivate ? "private" : "public",
        created_by: user?.id ?? null,
        is_archived: false,
      })
      .select()
      .single();

    if (data && !error) {
      const now = new Date().toISOString();
      const memberInserts = Array.from(selectedMembers).map((userId) => ({
        channel_id: data.id,
        user_id: userId,
        last_read_at: now,
        notifications: "all",
      }));

      if (memberInserts.length > 0) {
        await supabase.from("channel_members").insert(memberInserts);
      }

      onCreated(data);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Criar canal</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome do canal</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: marketing"
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Do que se trata este canal?"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-input"
            />
            <Lock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Canal privado</span>
          </label>

          {/* Member selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" />
                Membros
              </label>
              <button
                type="button"
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="border border-input rounded-lg max-h-48 overflow-y-auto">
              {orgMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhum membro encontrado
                </p>
              )}
              {orgMembers.map((m: any) => {
                const p = m.profiles;
                const memberName = p?.full_name || p?.email || "?";
                const isCreator = m.user_id === currentUserId;
                const isChecked = selectedMembers.has(m.user_id);
                return (
                  <label
                    key={m.user_id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer border-b border-input last:border-b-0",
                      isCreator && "opacity-70 cursor-default"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMember(m.user_id)}
                      disabled={isCreator}
                      className="rounded border-input shrink-0"
                    />
                    <div className="relative shrink-0">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt={memberName} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: generateColor(memberName) }}
                        >
                          {getInitials(memberName)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {memberName}
                        {isCreator && (
                          <span className="text-xs text-muted-foreground ml-1">(você)</span>
                        )}
                      </p>
                      {p?.email && (
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedMembers.size} membro{selectedMembers.size !== 1 ? "s" : ""} selecionado{selectedMembers.size !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar canal
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Create DM Modal
// ============================================================
function CreateDMModal({
  orgId,
  members: initialMembers,
  currentUserId,
  existingDMs,
  onClose,
  onCreated,
}: {
  orgId: string;
  members: any[];
  currentUserId: string;
  existingDMs: any[];
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [freshMembers, setFreshMembers] = useState<any[]>(initialMembers);
  const supabase = createClient();

  // Always reload members fresh when modal opens (ensures new members appear instantly)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email, status)")
        .eq("org_id", orgId);
      if (data) setFreshMembers(data);
    })();
  }, [orgId]);

  const otherMembers = freshMembers
    .filter((m: any) => m.user_id !== currentUserId)
    .filter((m: any) => {
      const name = m.profiles?.full_name || m.profiles?.email || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function startDM(targetUserId: string) {
    // Check frontend cache first
    const existing = existingDMs.find(
      (dm: any) => dm.otherUser?.id === targetUserId
    );
    if (existing) {
      onCreated(existing);
      return;
    }

    setLoading(true);

    // All DM logic goes through server API (bypasses RLS issues)
    const targetProfile = freshMembers.find((m: any) => m.user_id === targetUserId)?.profiles;
    const dmName = targetProfile?.full_name || targetProfile?.email || "DM";

    const res = await fetch("/api/chat/create-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, targetUserId, dmName }),
    });

    if (res.ok) {
      const { channel } = await res.json();
      if (channel) onCreated(channel);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Nova mensagem direta</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar membro..."
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-3"
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {otherMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {members.length <= 1 ? "Convide membros primeiro em Configurações" : "Nenhum membro encontrado"}
            </p>
          )}
          {otherMembers.map((m: any) => {
            const p = m.profiles;
            const name = p?.full_name || p?.email || "?";
            const isOnline = p?.status === "online";
            return (
              <button
                key={m.user_id}
                onClick={() => startDM(m.user_id)}
                disabled={loading}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-left transition-colors disabled:opacity-50"
              >
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: generateColor(name) }}
                  >
                    {getInitials(name)}
                  </div>
                  <div
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                      isOnline ? "bg-green-500" : "bg-muted0"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p?.email}</p>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
