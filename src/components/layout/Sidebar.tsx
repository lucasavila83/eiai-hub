"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare, Kanban, Bell, Settings, Calendar, BarChart3, Zap, Plug, Workflow,
  Hash, Lock, ChevronDown, ChevronRight, ChevronLeft,
  Plus, LogOut, X, Loader2, Users, MessageCircle, Check,
  MoreHorizontal, Trash2, EyeOff, UserCog, Target, Pencil, Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import { useChatStore } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { setFaviconBadge } from "@/lib/utils/favicon-badge";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Profile, Organization, Channel } from "@/lib/types/database";
// Sound, toast and desktop notifications handled by NotificationListener

interface SidebarProps {
  profile: Profile | null;
  organizations: Organization[];
}

export function Sidebar({ profile, organizations }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { channels, setChannels, unreadCounts, setUnreadCount, setAllUnreadCounts, incrementUnread } = useChatStore();
  const { sidebarOpen, setSidebarOpen, toggleSidebar, setActiveOrgId, isMobile } = useUIStore();
  const notifUnread = useNotificationStore((s) => s.unreadCount);

  // Show number of CHATS with unread messages in tab title + favicon badge +
  // installed-PWA app badge. Counts channels/DMs that have at least one unread
  // message (not total messages).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const chatsWithUnread = Object.values(unreadCounts).filter((n) => (n || 0) > 0).length;
    // Strip any previous "(N) " prefix and rebuild from the underlying title.
    const base = document.title.replace(/^\(\d+\)\s+/, "") || "Lesco-Hub";
    document.title = chatsWithUnread > 0 ? `(${chatsWithUnread}) ${base}` : base;
    // Draw a red badge on the favicon too (clears when count = 0)
    setFaviconBadge(chatsWithUnread);

    // Installed PWA: set/clear the OS-level app icon badge (the number that
    // showed up stale on Lucas's phone). Supported on Android/Chrome and
    // recent Edge. Unsupported browsers ignore the calls.
    if (typeof navigator !== "undefined") {
      const nav = navigator as any;
      try {
        if (chatsWithUnread > 0 && typeof nav.setAppBadge === "function") {
          nav.setAppBadge(chatsWithUnread).catch(() => {});
        } else if (chatsWithUnread === 0 && typeof nav.clearAppBadge === "function") {
          nav.clearAppBadge().catch(() => {});
          // Also tell the SW to close any chat notifications still sitting
          // in the tray — otherwise Android keeps the badge visible on the
          // app icon even after the OS-level badge was cleared.
          if (nav.serviceWorker?.controller) {
            nav.serviceWorker.controller.postMessage({
              type: "close-all-notifications",
            });
          }
        }
      } catch (_) {
        // Browser without App Badge API — nothing to do.
      }
    }
  }, [unreadCounts]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(
    organizations[0] || null
  );
  const [dmChannels, setDmChannels] = useState<(Channel & { otherUser?: any })[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<Record<string, string>>({});
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateDM, setShowCreateDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
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

  // Load unread counts AND last-message timestamps in one pass.
  //
  // Previous version queried only messages from OTHER users (for the
  // count). We now also compute the latest message timestamp PER
  // channel from the same row set so the DM list sort stays fresh
  // when realtime hiccups. We DON'T include own messages in the
  // unread count (.neq below) but the latest-at fall-back is good
  // enough — own messages bump the channel via the optimistic local
  // append in ChatWindow anyway.
  const loadUnreadCounts = useCallback(async () => {
    if (!profile) return;
    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", profile.id);

    if (!memberships || memberships.length === 0) {
      setAllUnreadCounts({});
      return;
    }

    const channelIds = memberships.map((m: any) => m.channel_id);
    // Fetch messages from all member channels in one query. We cap at 30 days
    // back so the result set stays bounded; older unread mentions are rare
    // enough that the "99+" cap will already be showing anyway.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: msgs } = await supabase
      .from("messages")
      .select("channel_id, created_at, user_id")
      .in("channel_id", channelIds)
      .neq("user_id", profile.id)
      .gte("created_at", cutoff);

    const lastReadMap: Record<string, string | null> = {};
    for (const m of memberships) {
      lastReadMap[(m as any).channel_id] = (m as any).last_read_at || null;
    }

    const counts: Record<string, number> = {};
    const latestAt: Record<string, string> = {};
    for (const id of channelIds) counts[id] = 0;
    for (const m of msgs || []) {
      const cid = (m as any).channel_id;
      const createdAt = (m as any).created_at;
      // Sort hint — latest message timestamp seen for this channel
      if (!latestAt[cid] || createdAt > latestAt[cid]) latestAt[cid] = createdAt;
      // Unread count — skip messages already read
      const lastRead = lastReadMap[cid];
      if (lastRead && createdAt <= lastRead) continue;
      counts[cid] = (counts[cid] || 0) + 1;
    }

    setAllUnreadCounts(counts);

    // Refresh the lastMessageAt sort hint, but ONLY entries that
    // actually changed — keep the same ref otherwise to avoid a
    // re-render of every <Link> in the DM list.
    setLastMessageAt((prev) => {
      let changed = false;
      const next: Record<string, string> = { ...prev };
      for (const cid of Object.keys(latestAt)) {
        if (next[cid] !== latestAt[cid]) {
          next[cid] = latestAt[cid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [profile, setAllUnreadCounts]);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Refs to avoid stale closures in realtime callbacks
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const activeOrgRef = useRef(activeOrg);
  useEffect(() => { activeOrgRef.current = activeOrg; }, [activeOrg]);
  const dmChannelsRef = useRef(dmChannels);
  useEffect(() => { dmChannelsRef.current = dmChannels; }, [dmChannels]);

  // Set of channel IDs the user is actually a member of. Used by the
  // realtime message INSERT handler to skip messages for channels we don't
  // care about (org has many channels, only a few are in this user's
  // sidebar).
  const myChannelIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set<string>();
    channels.forEach((c) => ids.add(c.id));
    dmChannels.forEach((c) => ids.add(c.id));
    myChannelIdsRef.current = ids;
  }, [channels, dmChannels]);

  // Stable IDs for subscription deps (avoid object reference changes)
  const profileId = profile?.id;
  const orgId = activeOrg?.id;

  // Unread badges are handled by NotificationListener (broadcast + CDC)
  // Sidebar only polls as fallback

  // Consolidated realtime subscription for sidebar (org data changes)
  useEffect(() => {
    if (!orgId || !profileId) return;

    const sub = supabase
      .channel(`sidebar-rt-${orgId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "org_members",
        filter: `org_id=eq.${orgId}`,
      }, () => {
        const org = activeOrgRef.current;
        if (org) loadOrgMembers(org.id);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "channels",
        filter: `org_id=eq.${orgId}`,
      }, () => {
        const org = activeOrgRef.current;
        if (org) {
          loadChannels(org.id);
          loadDMs(org.id);
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "channel_members",
      }, (payload: any) => {
        const cm = payload.new;
        if (cm.user_id === profileRef.current?.id) {
          const org = activeOrgRef.current;
          if (org) {
            loadChannels(org.id);
            loadDMs(org.id);
          }
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "channel_members",
      }, (payload: any) => {
        // Cross-device read-sync. When the user reads a channel on one
        // device we UPDATE channel_members.last_read_at. Other devices
        // get that UPDATE here and zero out their local unread count
        // for the same channel — so the "you have 1 unread" bubble on
        // the desktop disappears the moment the phone catches up.
        const cm = payload.new;
        const oldCm = payload.old;
        if (!cm || cm.user_id !== profileRef.current?.id) return;
        const newRead = cm.last_read_at;
        const oldRead = oldCm?.last_read_at;
        if (newRead && newRead !== oldRead) {
          useChatStore.getState().markAsRead(cm.channel_id);
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, async (payload: any) => {
        const msg = payload.new;

        // Skip own messages right away — they don't bump unread counts
        // and we never want to mark our own writes as unread.
        if (msg.user_id === profileRef.current?.id) return;

        // The earlier "skip if not in my channel set" filter was too
        // aggressive: a brand-new DM (or a hidden DM that just got
        // auto-unhidden by the message trigger) isn't in `dmChannels`
        // yet at the moment the message arrives, so we'd drop the
        // event and the unread badge would never show. Now we only
        // use the channel-set as a HINT for the lastMessageAt sort
        // optimisation, never as a filter for the unread count.
        const myChannels = myChannelIdsRef.current;
        const isKnownChannel = !myChannels || myChannels.has(msg.channel_id);

        if (isKnownChannel) {
          // Sort hint — keep guarded so identical timestamps don't
          // trigger spurious re-renders.
          setLastMessageAt((prev) => {
            if (prev[msg.channel_id] === msg.created_at) return prev;
            return { ...prev, [msg.channel_id]: msg.created_at };
          });
        }

        // Increment unread if the user isn't actively viewing the channel.
        // Run this regardless of whether the channel is already loaded —
        // the count is keyed by channel_id and will surface as soon as
        // the sidebar finishes (re)loading the DM list below.
        if (pathnameRef.current !== `/chat/${msg.channel_id}`) {
          incrementUnread(msg.channel_id);
        }

        // Pull a fresh DM list if this is a channel we don't have on
        // screen yet — covers brand-new DMs and DB-trigger-unhidden ones.
        const currentDMs = dmChannelsRef.current;
        const isInSidebar = currentDMs.some((dm: any) => dm.id === msg.channel_id);
        if (!isInSidebar) {
          const org = activeOrgRef.current;
          if (org) loadDMs(org.id);
        }
      })
      .subscribe((status) => {
        // Do NOT manually re-subscribe on CHANNEL_ERROR. Supabase's realtime
        // client already handles socket reconnection with exponential
        // backoff. Re-subscribing on a broken socket every 3s just burned
        // CPU and blocked the main thread enough to swallow the first click
        // on a sidebar link ("need to click twice" bug). Just log once.
        if (status === "CHANNEL_ERROR") {
          console.warn("[Sidebar] realtime CHANNEL_ERROR — waiting for client auto-reconnect");
        }
      });

    return () => { supabase.removeChannel(sub); };
  }, [orgId, profileId]); // Only string IDs — stable across re-renders

  // Safety-net polling for unread counts. The realtime subscription
  // is the primary path, but the websocket DOES fail in the wild
  // (saw CHANNEL_ERRORs on users' consoles), and when it does the
  // unread badges silently stop updating. Fall back to a 20s poll —
  // we ONLY poll loadUnreadCounts (NOT loadDMs) because:
  //
  //   • loadUnreadCounts pushes through setAllUnreadCounts which
  //     short-circuits when the counts haven't actually changed,
  //     so a no-op poll stays a no-op render.
  //   • loadDMs was the polling source that re-rendered every <Link>
  //     in the sidebar and swallowed the first click — keep that
  //     out of the timer.
  //
  // We also refresh on window focus so a phone coming back from
  // sleep catches up immediately.
  useEffect(() => {
    if (!profileId || !orgId) return;
    function refresh() {
      loadUnreadCounts();
    }
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 20000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [profileId, orgId, loadUnreadCounts]);

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

    // Get channel IDs where current user is a member and NOT hidden (per-user)
    const { data: myChannelMembers } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", profile.id)
      .eq("is_hidden", false);

    if (!myChannelMembers || myChannelMembers.length === 0) {
      setDmChannels([]);
      return;
    }

    const myChannelIds = myChannelMembers.map((cm: any) => cm.channel_id);

    // Then load only DM channels the user belongs to. `.order("id")` makes
    // the response order deterministic across polls — without it, Postgres
    // is free to return rows in different orders, which would defeat the
    // same-content guard below and re-render every <Link> every 15s.
    const { data } = await supabase
      .from("channels")
      .select("*, channel_members(user_id, profiles:user_id(id, full_name, avatar_url, email, status))")
      .eq("org_id", orgId)
      .eq("type", "dm")
      .in("id", myChannelIds)
      .order("id");

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

      // Only update state if the DM list actually changed. Compare by ID
      // map (not positional) so that even if Postgres did return rows in a
      // different order we still detect "nothing changed" and skip the
      // re-render. A spurious re-render here races with the user's click
      // on a sidebar <Link> and swallows it — the origin of the old
      // "need to click twice" bug.
      setDmChannels((prev) => {
        if (prev.length !== enriched.length) return enriched;
        const prevById = new Map(prev.map((dm: any) => [dm.id, dm]));
        for (const b of enriched) {
          const a = prevById.get(b.id);
          if (
            !a ||
            a.otherUser?.id !== b.otherUser?.id ||
            a.otherUser?.status !== b.otherUser?.status ||
            a.otherUser?.avatar_url !== b.otherUser?.avatar_url ||
            a.otherUser?.full_name !== b.otherUser?.full_name
          ) {
            return enriched;
          }
        }
        return prev; // identical — keep the same ref, avoid re-render
      });

      // Load last message timestamp for each DM (for sorting).
      const dmIds = enriched.map((ch: any) => ch.id);
      if (dmIds.length > 0) {
        const { data: recentMsgs } = await supabase
          .from("messages")
          .select("channel_id, created_at")
          .in("channel_id", dmIds)
          .order("created_at", { ascending: false })
          .limit(dmIds.length * 3);

        const map: Record<string, string> = {};
        for (const m of recentMsgs || []) {
          const id = (m as any).channel_id;
          const at = (m as any).created_at;
          if (!map[id] || at > map[id]) map[id] = at;
        }
        // MERGE into lastMessageAt — never replace. The earlier version
        // did a full replace, which wiped entries that loadUnreadCounts
        // had populated for DMs whose most-recent message wasn't in the
        // tiny window queried here. Result: a DM with activity from
        // 30 days ago lost its sort hint and fell back to alphabetical.
        setLastMessageAt((prev) => {
          let changed = false;
          const next: Record<string, string> = { ...prev };
          for (const cid of Object.keys(map)) {
            if (next[cid] !== map[cid]) {
              next[cid] = map[cid];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    }
  }

  async function loadOrgMembers(orgId: string) {
    const { data } = await supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email, status)")
      .eq("org_id", orgId);
    if (!data) return;
    // Idempotency guard — org_members realtime events fire whenever anyone
    // joins/leaves any team. Without this check, every such event replaced
    // `orgMembers` with a new array ref and re-rendered the whole sidebar.
    setOrgMembers((prev) => {
      if (prev.length !== data.length) return data;
      const prevById = new Map(prev.map((m: any) => [m.user_id, m]));
      for (const m of data) {
        const p = prevById.get((m as any).user_id);
        const mp = (m as any).profiles;
        const pp = p?.profiles;
        if (
          !p ||
          p.role !== (m as any).role ||
          pp?.full_name !== mp?.full_name ||
          pp?.avatar_url !== mp?.avatar_url ||
          pp?.status !== mp?.status
        ) {
          return data;
        }
      }
      return prev; // no change
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleArchiveDM(dmId: string) {
    // Hide only for current user (per-user visibility)
    await supabase
      .from("channel_members")
      .update({ is_hidden: true })
      .eq("channel_id", dmId)
      .eq("user_id", profile?.id || "");
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

  // DM ordering rule (Lucas's spec):
  //   1. Unread DMs at the top with the red badge, sorted by most-recent
  //      message first.
  //   2. A divider line.
  //   3. Everything else below, in alphabetical order by name —
  //      regardless of whether they have message history or not.
  const filteredDMs = dmChannels.filter((dm) => {
    if (!dmSearch.trim()) return true;
    const name = dm.otherUser?.full_name || dm.otherUser?.email || "";
    return name.toLowerCase().includes(dmSearch.toLowerCase());
  });

  const unreadDMs = filteredDMs
    .filter((dm) => (unreadCounts[dm.id] || 0) > 0)
    .sort((a, b) => {
      const lastA = lastMessageAt[a.id] || "";
      const lastB = lastMessageAt[b.id] || "";
      if (lastA && lastB && lastA !== lastB) return lastB.localeCompare(lastA);
      if (lastA && !lastB) return -1;
      if (!lastA && lastB) return 1;
      return 0;
    });

  const readDMs = filteredDMs
    .filter((dm) => (unreadCounts[dm.id] || 0) === 0)
    .sort((a, b) => {
      const nameA = (a.otherUser?.full_name || a.otherUser?.email || "").toLowerCase();
      const nameB = (b.otherUser?.full_name || b.otherUser?.email || "").toLowerCase();
      return nameA.localeCompare(nameB, "pt-BR");
    });

  const sortedDMs = [...unreadDMs, ...readDMs];

  const allNavItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat", visible: true },
    { href: "/boards", icon: Kanban, label: "Boards", visible: true },
    { href: "/processes", icon: Workflow, label: "Processos", visible: perms.processes.view || perms.isAdmin },
    { href: "/calendar", icon: Calendar, label: "Calendário", visible: perms.canViewCalendar },
    { href: "/dashboard", icon: BarChart3, label: "Dashboard", visible: perms.canViewDashboard || perms.isAdmin },
    { href: "/automations", icon: Zap, label: "Automações", visible: perms.canManageAutomations || perms.isAdmin },
    { href: "/goals", icon: Target, label: "Metas", visible: perms.canViewDashboard || perms.isAdmin },
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

  // On mobile, close sidebar when navigating.
  // Read window.innerWidth directly instead of trusting the `isMobile`
  // store slice — the store slice is set async-after-mount, and if the
  // user manages to tap a DM before React flushes that state update the
  // check would be false and the drawer would stay open. The viewport
  // width is never stale.
  function handleMobileNavClose() {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }

  return (
    <div ref={sidebarRef} className="relative flex h-full shrink-0">
      {/* ===== 1st COLUMN: Icon bar (hidden on mobile, visible md+) + hover overlay with labels ===== */}
      <div
        className={cn("relative z-30 shrink-0", isMobile && "hidden")}
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
              className="w-8 h-8 rounded-full bg-white p-0.5 object-contain"
            />
          </div>

          {/* Nav Icons */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {navItems.map(({ href, icon: Icon, label }) => {
              const hasUnread = (href === "/chat" && Object.values(unreadCounts).some(c => c > 0))
                || (href === "/notifications" && notifUnread > 0);
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
        <div className={cn(
          "bg-muted border-r border-border flex flex-col h-full shrink-0 z-10",
          isMobile ? "w-full" : "w-56"
        )}>
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
            {/* Mobile-only navigation: on desktop the icon strip (first
                column) handles these, but on mobile that strip is
                hidden so we surface them inside the drawer instead.
                Otherwise the user has no way to get from /chat to
                /boards, /calendar, /dashboard, etc. */}
            {isMobile && (
              <div className="mb-4">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Navegação
                  </span>
                </div>
                <div className="space-y-0.5">
                  {navItems.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname.startsWith(href);
                    const hasUnread =
                      (href === "/chat" && Object.values(unreadCounts).some((c) => c > 0)) ||
                      (href === "/notifications" && notifUnread > 0);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={handleMobileNavClose}
                        className={cn(
                          "flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="flex-1">{label}</span>
                        {hasUnread && !isActive && (
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </Link>
                    );
                  })}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <LogOut className="w-5 h-5 shrink-0" />
                    <span className="flex-1 text-left">Sair</span>
                  </button>
                </div>
              </div>
            )}

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
                        onClick={handleMobileNavClose}
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
              {/* Search filter */}
              <div className="px-2 pb-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={dmSearch}
                    onChange={(e) => setDmSearch(e.target.value)}
                    placeholder="Buscar membro..."
                    className="w-full pl-7 pr-2 py-1 text-xs bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {dmSearch && (
                    <button onClick={() => setDmSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                {sortedDMs.map((dm, idx) => {
                  const isActive = pathname === `/chat/${dm.id}`;
                  const unread = unreadCounts[dm.id] || 0;
                  const user = dm.otherUser;
                  const name = user?.full_name || user?.email || "Usuário";
                  const isOnline = user?.status === "online";
                  // Show divider between unread and read sections
                  const showDivider = unreadDMs.length > 0 && idx === unreadDMs.length;
                  return (
                    <div key={dm.id}>
                      {showDivider && (
                        <div className="border-t border-border my-1.5 mx-2" />
                      )}
                      <Link
                        href={`/chat/${dm.id}`}
                        onClick={handleMobileNavClose}
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
                    </div>
                  );
                })}
                {/* Show matching org members not in current DMs when searching */}
                {dmSearch.trim() && (() => {
                  const dmUserIds = new Set(dmChannels.map((dm: any) => dm.otherUser?.id).filter(Boolean));
                  const matchingMembers = orgMembers.filter((m: any) => {
                    if (m.user_id === profile?.id) return false;
                    if (dmUserIds.has(m.user_id)) return false;
                    const name = m.profiles?.full_name || m.profiles?.email || "";
                    return name.toLowerCase().includes(dmSearch.toLowerCase());
                  });
                  if (matchingMembers.length === 0) return null;
                  return (
                    <>
                      {sortedDMs.length > 0 && <div className="border-t border-border my-1.5 mx-2" />}
                      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Iniciar conversa
                      </div>
                      {matchingMembers.map((m: any) => {
                        const p = m.profiles;
                        const name = p?.full_name || p?.email || "?";
                        const isOnline = p?.status === "online";
                        return (
                          <button
                            key={m.user_id}
                            onClick={async () => {
                              const dmName = p?.full_name || p?.email || "DM";
                              const res = await fetch("/api/chat/create-dm", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ orgId: activeOrg?.id, targetUserId: m.user_id, dmName }),
                              });
                              if (res.ok) {
                                const { channel } = await res.json();
                                if (channel) {
                                  setDmSearch("");
                                  // Add to DM list immediately with profile data
                                  const enriched = { ...channel, otherUser: p || null };
                                  setDmChannels((prev) => {
                                    const filtered = prev.filter((dm) => dm.id !== channel.id);
                                    return [enriched, ...filtered];
                                  });
                                  router.push(`/chat/${channel.id}`);
                                  // Delayed refresh to avoid overwriting the direct injection
                                  setTimeout(() => loadDMs(activeOrg?.id || ""), 2000);
                                }
                              }
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left"
                          >
                            <div className="relative shrink-0">
                              {p?.avatar_url ? (
                                <img src={p.avatar_url} alt={name} className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                  style={{ backgroundColor: generateColor(name) }}
                                >
                                  {getInitials(name)}
                                </div>
                              )}
                              <div className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-50", isOnline ? "bg-green-500" : "bg-gray-400")} />
                            </div>
                            <span className="flex-1 truncate">{name}</span>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
                {sortedDMs.length === 0 && !dmSearch && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Nenhuma conversa ainda
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Expand button when content panel is collapsed — hidden on mobile (use hamburger in TopBar) */}
      {!sidebarOpen && !isMobile && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-14 left-[60px] z-20 w-6 h-6 flex items-center justify-center rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
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
                <Pencil className="w-4 h-4" />
                Editar canal
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
            // Build enriched channel with otherUser for immediate sidebar display
            const enriched = {
              ...ch,
              otherUser: ch._otherUser || null,
            };
            // Add to DM list immediately (avoid duplicates)
            setDmChannels((prev) => {
              const filtered = prev.filter((dm) => dm.id !== ch.id);
              return [enriched, ...filtered];
            });
            router.push(`/chat/${ch.id}`);
            // Delayed refresh to avoid overwriting the direct injection
            setTimeout(() => loadDMs(activeOrg?.id || ""), 2000);
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

  // Channel info editing
  const [channelName, setChannelName] = useState(channel.name);
  const [channelDesc, setChannelDesc] = useState((channel as any).description || "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [saveInfoSuccess, setSaveInfoSuccess] = useState(false);

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

  async function handleSaveChannelInfo() {
    if (!channelName.trim()) return;
    setSavingInfo(true);
    setSaveInfoSuccess(false);
    await supabase
      .from("channels")
      .update({ name: channelName.trim(), description: channelDesc.trim() || null } as any)
      .eq("id", channel.id);
    setSavingInfo(false);
    setSaveInfoSuccess(true);
    setTimeout(() => setSaveInfoSuccess(false), 2000);
    onMembersUpdated();
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

        {/* Channel info editing */}
        <div className="space-y-3 mb-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Nome do canal</label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Nome do canal"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
            <textarea
              value={channelDesc}
              onChange={(e) => setChannelDesc(e.target.value)}
              placeholder="Descreva o propósito deste canal..."
              rows={2}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <button
            onClick={handleSaveChannelInfo}
            disabled={savingInfo || !channelName.trim()}
            className={cn(
              "w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors",
              saveInfoSuccess
                ? "bg-green-600 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            {savingInfo && <Loader2 className="w-4 h-4 animate-spin" />}
            {saveInfoSuccess ? "Salvo!" : "Salvar informações"}
          </button>
        </div>

        <div className="border-t border-border mb-5" />

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
    setLoading(true);

    // Always go through the server API — it handles un-archiving and deduplication
    const targetProfile = freshMembers.find((m: any) => m.user_id === targetUserId)?.profiles;
    const dmName = targetProfile?.full_name || targetProfile?.email || "DM";

    const res = await fetch("/api/chat/create-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, targetUserId, dmName }),
    });

    if (res.ok) {
      const { channel } = await res.json();
      if (channel) {
        // Enrich channel with otherUser profile so sidebar can display it immediately
        channel._otherUser = targetProfile || null;
        onCreated(channel);
      }
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
