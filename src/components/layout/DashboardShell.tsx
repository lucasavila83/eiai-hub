"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PresenceTracker } from "@/components/layout/PresenceTracker";
import { NotificationListener } from "@/components/layout/NotificationListener";
import { ToastNotifications } from "@/components/layout/ToastNotifications";
import { DailyAgenda } from "@/components/layout/DailyAgenda";
import { PWARegister } from "@/components/layout/PWARegister";
import { PushNotificationsPrompt } from "@/components/layout/PushNotificationsPrompt";
import { useUIStore } from "@/lib/stores/ui-store";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, profile, organizations } = useAuth();
  const { isMobile, sidebarOpen, setIsMobile, setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  // Detect mobile on resize
  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      const wasMobile = useUIStore.getState().isMobile;
      if (mobile !== wasMobile) {
        setIsMobile(mobile);
        // Only auto-close when FLIPPING to mobile. The per-route default
        // below handles the initial-landing case.
        if (mobile && wasMobile === false) setSidebarOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);
    // Also run on mount to sync SSR state
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsMobile, setSidebarOpen]);

  // On mobile, /chat (no specific channel yet) and / should land with the
  // drawer OPEN so the user sees the chat list immediately instead of the
  // empty "select a channel" placeholder. Any specific route (/chat/:id,
  // /boards, etc.) keeps the drawer closed so the main content fills the
  // viewport.
  useEffect(() => {
    if (!isMobile) return;
    const isChatLanding = pathname === "/chat" || pathname === "/" || pathname === "";
    // Only change state if we need to — avoids churn + unexpected re-renders.
    const current = useUIStore.getState().sidebarOpen;
    if (isChatLanding && !current) setSidebarOpen(true);
    if (!isChatLanding && current) setSidebarOpen(false);
  }, [pathname, isMobile, setSidebarOpen]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <PresenceTracker userId={user.id} currentStatus={profile?.status || "online"} />
      <NotificationListener />
      <ToastNotifications />
      <DailyAgenda />
      <PWARegister />
      <PushNotificationsPrompt />


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
