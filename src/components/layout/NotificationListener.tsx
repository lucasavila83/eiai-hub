"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUIStore } from "@/lib/stores/ui-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useNotificationSound } from "@/lib/hooks/useNotificationSound";
import { useDesktopNotifications } from "@/lib/hooks/useDesktopNotifications";

interface ChannelPref {
  channel_id: string;
  notifications: string;
}

export function NotificationListener() {
  const supabase = createClient();
  const { user } = useAuth();
  const { activeOrgId } = useUIStore();
  const pathname = usePathname();
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const loadPreferences = useNotificationStore((s) => s.loadPreferences);

  const { playSound } = useNotificationSound();
  const { permission, requestPermission, showNotification } = useDesktopNotifications();

  const [channelPrefs, setChannelPrefs] = useState<Record<string, string>>({});
  const [permissionAsked, setPermissionAsked] = useState(false);
  const initializedRef = useRef(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Load initial unread notification count
  useEffect(() => {
    if (!user?.id || !activeOrgId) return;

    async function loadUnreadCount() {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("org_id", activeOrgId!)
        .eq("is_read", false);

      if (count !== null) {
        useNotificationStore.getState().setUnreadCount(count);
      }
    }

    async function loadRecent() {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, is_read, created_at")
        .eq("user_id", user!.id)
        .eq("org_id", activeOrgId!)
        .order("created_at", { ascending: false })
        .limit(15);

      if (data) {
        useNotificationStore.getState().setRecentNotifications(data);
      }
    }

    loadUnreadCount();
    loadRecent();
  }, [user?.id, activeOrgId, supabase]);

  // Load channel notification preferences
  useEffect(() => {
    if (!user?.id) return;

    async function loadChannelPrefs() {
      const { data } = await supabase
        .from("channel_members")
        .select("channel_id, notifications")
        .eq("user_id", user!.id);

      if (data) {
        const prefs: Record<string, string> = {};
        data.forEach((d: ChannelPref) => {
          prefs[d.channel_id] = d.notifications || "all";
        });
        setChannelPrefs(prefs);
      }
    }

    loadChannelPrefs();
  }, [user?.id, supabase]);

  // Ask for notification permission (once, subtly)
  useEffect(() => {
    if (permissionAsked) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("notification-permission-requested") === "true") return;

    // Wait a bit before asking
    const timer = setTimeout(() => {
      requestPermission();
      setPermissionAsked(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [permissionAsked, requestPermission]);

  // Subscribe to new messages (for sound + desktop notification)
  useEffect(() => {
    if (!user?.id || initializedRef.current) return;
    initializedRef.current = true;

    const channel = supabase
      .channel("notification-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            channel_id: string;
            user_id: string;
            content: string;
            mentions: string[] | null;
          };

          // Skip own messages
          if (msg.user_id === user!.id) return;

          // Skip if viewing that channel
          if (activeChannelId === msg.channel_id && pathname?.includes("/chat")) return;

          // Check channel preference
          const pref = channelPrefs[msg.channel_id] || "all";
          if (pref === "none") return;
          if (pref === "mentions") {
            const isMentioned = msg.mentions?.includes(user!.id);
            if (!isMentioned) return;
          }

          // Get sender name
          const { data: sender } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", msg.user_id)
            .single();

          const senderName = sender?.full_name || "Alguém";
          const body = msg.content?.substring(0, 100) || "Nova mensagem";

          // Play sound
          playSound();

          // Show desktop notification
          showNotification(senderName, {
            body,
            link: `/chat`,
            tag: `msg-${msg.channel_id}`,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user!.id}` },
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

          // Add to store
          addNotification(notif);

          // Play sound
          playSound();

          // Desktop notification
          showNotification(notif.title, {
            body: notif.body,
            link: notif.link || "/notifications",
            tag: `notif-${notif.id}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      initializedRef.current = false;
    };
  }, [user?.id, activeChannelId, pathname, channelPrefs, playSound, showNotification, addNotification, supabase]);

  return null; // This is a logic-only component
}
