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

const getInitialMobile = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: !getInitialMobile(),
  isMobile: getInitialMobile(),
  theme: "dark",
  activeOrgId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  setTheme: (theme) => set({ theme }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
}));
