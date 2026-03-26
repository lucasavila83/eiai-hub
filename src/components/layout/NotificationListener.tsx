"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient, onChatBroadcast } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUIStore } from "@/lib/stores/ui-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { playNotificationSound, unlockAudio } from "@/lib/utils/notification-sound";

// Cache sender profiles to avoid repeated DB queries
const profileCache: Record<string, { name: string; avatar: string | null }> = {};

export function NotificationListener() {
  const supabase = createClient();
  const { user } = useAuth();
  const { activeOrgId } = useUIStore();
  const pathname = usePathname();
  const activeChannelId = useChatStore((s) => s.activeChannelId);

  // Use refs for everything accessed inside realtime callbacks (avoid stale closures)
  const userRef = useRef(user);
  const activeChannelIdRef = useRef(activeChannelId);
  const pathnameRef = useRef(pathname);
  const activeOrgIdRef = useRef(activeOrgId);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { activeOrgIdRef.current = activeOrgId; }, [activeOrgId]);

  // Load preferences on mount
  useEffect(() => {
    useNotificationStore.getState().loadPreferences();
  }, []);

  // Request notification permission immediately on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Unlock audio on first user interaction
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

  // Load initial unread notification count
  useEffect(() => {
    if (!user?.id || !activeOrgId) return;

    (async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("org_id", activeOrgId)
        .eq("is_read", false);

      if (count !== null) {
        useNotificationStore.getState().setUnreadCount(count);
      }

      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, is_read, created_at")
        .eq("user_id", user.id)
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (data) {
        useNotificationStore.getState().setRecentNotifications(data);
      }
    })();
  }, [user?.id, activeOrgId]);

  // Load channel notification preferences
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      const { data } = await supabase
        .from("channel_members")
        .select("channel_id, notifications")
        .eq("user_id", user.id);

      if (data) {
        const prefs: Record<string, string> = {};
        data.forEach((d: any) => {
          prefs[d.channel_id] = d.notifications || "all";
        });
        channelPrefsRef.current = prefs;
      }
    })();
  }, [user?.id]);

  const channelPrefsRef = useRef<Record<string, string>>({});

  // Dedupe: track recently notified message IDs to avoid double-notify from broadcast + CDC
  const notifiedMsgIds = useRef(new Set<string>());

  async function handleNewMessage(msg: {
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    mentions: string[] | null;
  }) {
    // Dedupe
    if (notifiedMsgIds.current.has(msg.id)) return;
    notifiedMsgIds.current.add(msg.id);
    // Limit set size
    if (notifiedMsgIds.current.size > 200) {
      const arr = Array.from(notifiedMsgIds.current);
      notifiedMsgIds.current = new Set(arr.slice(-100));
    }

    // Skip own messages
    if (msg.user_id === userRef.current?.id) return;

    // Skip if viewing that channel
    const viewingChannel =
      activeChannelIdRef.current === msg.channel_id &&
      pathnameRef.current?.includes("/chat");
    if (viewingChannel) return;

    // Check channel preference
    const pref = channelPrefsRef.current[msg.channel_id] || "all";
    if (pref === "none") return;
    if (pref === "mentions") {
      if (!msg.mentions?.includes(userRef.current!.id)) return;
    }

    // Get sender profile (cached)
    let sender = profileCache[msg.user_id];
    if (!sender) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", msg.user_id)
        .single();
      sender = {
        name: profile?.full_name || "Alguém",
        avatar: profile?.avatar_url || null,
      };
      profileCache[msg.user_id] = sender;
    }

    const body = (msg.content || "Nova mensagem")
      .replace(/\*\*/g, "")
      .replace(/\n/g, " ")
      .substring(0, 100);

    // 1. Play sound
    playNotificationSound();

    // 2. Show in-app toast popup
    useNotificationStore.getState().addToast({
      title: sender.name,
      body,
      link: `/chat/${msg.channel_id}`,
      senderAvatar: sender.avatar,
    });

    // 3. Show desktop/OS push notification (always, even when tab focused)
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const notif = new Notification(sender.name, {
        body,
        icon: sender.avatar || "/lesco-icon.png",
        tag: `msg-${msg.channel_id}-${msg.id}`,
        silent: true,
      });
      notif.onclick = () => {
        window.focus();
        window.location.href = `/chat/${msg.channel_id}`;
        notif.close();
      };
      setTimeout(() => notif.close(), 6000);
    }
  }

  // Instant broadcast listener (bypasses CDC latency — ~0ms)
  useEffect(() => {
    if (!user?.id) return;
    const unsub = onChatBroadcast((msg) => handleNewMessage(msg));
    return unsub;
  }, [user?.id]);

  // Fallback: postgres_changes for messages not sent via broadcast (API, etc.)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("notification-listener-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as {
            id: string;
            channel_id: string;
            user_id: string;
            content: string;
            mentions: string[] | null;
          };
          handleNewMessage(msg);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const notif = payload.new as {
            id: string;
            type: string;
            title: string;
            body: string;
            link: string | null;
            is_read: boolean;
            created_at: string;
          };

          useNotificationStore.getState().addNotification(notif);
          playNotificationSound();
          useNotificationStore.getState().addToast({
            title: notif.title,
            body: notif.body,
            link: notif.link || "/notifications",
          });

          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            !document.hasFocus()
          ) {
            const n = new Notification(notif.title, {
              body: notif.body,
              icon: "/lesco-icon.png",
              tag: `notif-${notif.id}`,
              silent: true,
            });
            n.onclick = () => {
              window.focus();
              if (notif.link) window.location.href = notif.link;
              n.close();
            };
            setTimeout(() => n.close(), 6000);
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setTimeout(() => channel.subscribe(), 3000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // Only depends on user.id — refs handle the rest

  return null;
}
