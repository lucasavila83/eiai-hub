import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  theme: "dark" | "light" | "system";
  activeOrgId: string | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setActiveOrgId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  theme: "dark",
  activeOrgId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
}));
