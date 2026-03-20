"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PresenceTracker } from "@/components/layout/PresenceTracker";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, profile, organizations } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <PresenceTracker userId={user.id} currentStatus={profile?.status || "online"} />
      <Sidebar profile={profile} organizations={organizations} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar profile={profile} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
