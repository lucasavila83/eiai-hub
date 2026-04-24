import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  isMobile: boolean;
  theme: "dark" | "light" | "system";
  activeOrgId: string | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setIsMobile: (mobile: boolean) => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setActiveOrgId: (id: string | null) => void;
}

// IMPORTANT: SSR-safe defaults. Do NOT read `window` here.
// If server and client produce different initial state for isMobile,
// React's hydration walks the DOM against a different vdom than it rendered
// on the server and ends up attaching event handlers to the WRONG DOM nodes.
// Symptom on mobile: taps register on the element that sits at the same
// visual position as the desktop tree → "clicks go to random places".
// Real mobile detection happens in DashboardShell after mount.
export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true, // desktop default; flipped to false on mobile after mount
  isMobile: false,   // flipped to true on mobile after mount
  theme: "dark",
  activeOrgId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  setTheme: (theme) => set({ theme }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
}));
