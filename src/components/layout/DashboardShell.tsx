"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PresenceTracker } from "@/components/layout/PresenceTracker";
import { NotificationListener } from "@/components/layout/NotificationListener";
import { ToastNotifications } from "@/components/layout/ToastNotifications";
import { DailyAgenda } from "@/components/layout/DailyAgenda";
// PWA components temporarily disabled while we diagnose the mobile
// "site keeps loading" issue. Re-enable after we confirm the culprit.
// import { PWARegister } from "@/components/layout/PWARegister";
// import { PushNotificationsPrompt } from "@/components/layout/PushNotificationsPrompt";
import { useUIStore } from "@/lib/stores/ui-store";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, profile, organizations } = useAuth();
  const { isMobile, sidebarOpen, setIsMobile, setSidebarOpen } = useUIStore();

  // Detect mobile on resize
  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      const wasMobile = useUIStore.getState().isMobile;
      if (mobile !== wasMobile) {
        setIsMobile(mobile);
        if (mobile) setSidebarOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);
    // Also run on mount to sync SSR state
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsMobile, setSidebarOpen]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <PresenceTracker userId={user.id} currentStatus={profile?.status || "online"} />
      <NotificationListener />
      <ToastNotifications />
      <DailyAgenda />
      {/* <PWARegister /> <PushNotificationsPrompt /> — disabled, mobile debug */}


      {/* Mobile: sidebar as overlay */}
      {isMobile ? (
        <>
          {sidebarOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setSidebarOpen(false)}
              />
              {/* Sidebar drawer */}
              <div className="fixed inset-y-0 left-0 z-50 w-72 bg-muted shadow-2xl">
                <Sidebar profile={profile} organizations={organizations} />
              </div>
            </>
          )}
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar profile={profile} />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </>
      ) : (
        <>
          <Sidebar profile={profile} organizations={organizations} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar profile={profile} />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
