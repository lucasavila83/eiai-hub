"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare, Kanban, Bell, Settings,
  Hash, Lock, ChevronDown, Plus, LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import { useChatStore } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import type { Profile, Organization } from "@/lib/types/database";

interface SidebarProps {
  profile: Profile | null;
  organizations: Organization[];
}

export function Sidebar({ profile, organizations }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { channels, setChannels, unreadCounts } = useChatStore();
  const { sidebarOpen, setActiveOrgId } = useUIStore();
  const [activeOrg, setActiveOrg] = useState<Organization | null>(
    organizations[0] || null
  );

  useEffect(() => {
    if (activeOrg) {
      setActiveOrgId(activeOrg.id);
      loadChannels(activeOrg.id);
    }
  }, [activeOrg]);

  async function loadChannels(orgId: string) {
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_archived", false)
      .order("name");
    if (data) setChannels(data);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const navItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat" },
    { href: "/boards", icon: Kanban, label: "Boards" },
    { href: "/notifications", icon: Bell, label: "Notificações" },
    { href: "/settings", icon: Settings, label: "Configurações" },
  ];

  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full shrink-0">
      {/* Org Switcher */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent cursor-pointer">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: generateColor(activeOrg?.name || "X") }}
          >
            {getInitials(activeOrg?.name || "?")}
          </div>
          <span className="flex-1 text-sm font-semibold text-sidebar-foreground truncate">
            {activeOrg?.name || "Selecione org"}
          </span>
          <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />
        </div>
      </div>

      {/* Nav Icons */}
      <nav className="p-2 border-b border-sidebar-border">
        <div className="flex gap-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-xs transition-colors",
                pathname.startsWith(href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
              title={label}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate">{label.split(" ")[0]}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto p-2">
        {pathname.startsWith("/chat") && (
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Canais
              </span>
              <button className="hover:text-sidebar-foreground text-sidebar-foreground/50 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-0.5">
              {channels.map((channel) => {
                const isActive = pathname === `/chat/${channel.id}`;
                const unread = unreadCounts[channel.id] || 0;
                return (
                  <Link
                    key={channel.id}
                    href={`/chat/${channel.id}`}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    {channel.type === "private" ? (
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{channel.name}</span>
                    {unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: generateColor(profile?.full_name || profile?.email || "U") }}
          >
            {getInitials(profile?.full_name || profile?.email || "U")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{profile?.status}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
