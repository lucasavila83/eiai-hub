"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Bell, Menu, Check, ExternalLink } from "lucide-react";
import { useNotificationStore, type NotificationItem } from "@/lib/stores/notification-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { getInitials, generateColor } from "@/lib/utils/helpers";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile | null;
}

export function TopBar({ profile }: TopBarProps) {
  const { toggleSidebar } = useUIStore();

  return (
    <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
      <button
        onClick={toggleSidebar}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3 ml-auto">
        {/* Logo Lesco */}
        <img src="/lesco-logo.png" alt="Lesco" className="h-8" />

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
