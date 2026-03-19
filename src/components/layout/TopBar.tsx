"use client";

import { Bell, Menu, Search } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { getInitials, generateColor } from "@/lib/utils/helpers";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile | null;
}

export function TopBar({ profile }: TopBarProps) {
  const { toggleSidebar } = useUIStore();

  return (
    <header className="h-12 border-b border-border bg-background/80 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0">
      <button
        onClick={toggleSidebar}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button className="relative text-muted-foreground hover:text-foreground transition-colors p-1.5">
          <Bell className="w-5 h-5" />
        </button>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: generateColor(profile?.full_name || profile?.email || "U") }}
        >
          {getInitials(profile?.full_name || profile?.email || "U")}
        </div>
      </div>
    </header>
  );
}
