import { create } from "zustand";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ToastItem {
  id: string;
  title: string;
  body: string;
  link?: string;
  timestamp: number;
  senderAvatar?: string | null;
  icon?: string; // emoji or icon identifier
}

interface NotificationState {
  unreadCount: number;
  recentNotifications: NotificationItem[];
  toasts: ToastItem[];
  soundEnabled: boolean;
  desktopEnabled: boolean;
  dropdownOpen: boolean;

  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  addNotification: (item: NotificationItem) => void;
  setRecentNotifications: (items: NotificationItem[]) => void;
  addToast: (toast: Omit<ToastItem, "id" | "timestamp">) => void;
  removeToast: (id: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setDesktopEnabled: (enabled: boolean) => void;
  setDropdownOpen: (open: boolean) => void;
  loadPreferences: () => void;
}

let toastCounter = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  recentNotifications: [],
  toasts: [],
  soundEnabled: true,
  desktopEnabled: true,
  dropdownOpen: false,

  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  resetUnread: () => set({ unreadCount: 0 }),

  addNotification: (item) =>
    set((s) => ({
      recentNotifications: [item, ...s.recentNotifications].slice(0, 15),
      unreadCount: s.unreadCount + 1,
    })),

  setRecentNotifications: (items) =>
    set((state) => {
      // Idempotency guard: the NotificationListener polls every 30s and
      // would otherwise replace `recentNotifications` with a fresh array
      // even when nothing changed. That forces the TopBar <NotificationBell/>
      // to re-render, which briefly swaps its DOM nodes and swallows any
      // click that lands in that window.
      const prev = state.recentNotifications;
      if (prev.length !== items.length) return { recentNotifications: items };
      for (let i = 0; i < items.length; i++) {
        const a = prev[i];
        const b = items[i];
        if (
          a.id !== b.id ||
          a.is_read !== b.is_read ||
          a.title !== b.title ||
          a.body !== b.body
        ) {
          return { recentNotifications: items };
        }
      }
      return {}; // no change
    }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const item: ToastItem = { ...toast, id, timestamp: Date.now() };
    set((s) => ({ toasts: [...s.toasts, item].slice(-5) }));
    // Auto-remove after 6 seconds
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSoundEnabled: (enabled) => {
    localStorage.setItem("notification-sound", String(enabled));
    set({ soundEnabled: enabled });
  },
  setDesktopEnabled: (enabled) => {
    localStorage.setItem("notification-desktop", String(enabled));
    set({ desktopEnabled: enabled });
  },

  setDropdownOpen: (open) => set({ dropdownOpen: open }),

  loadPreferences: () => {
    if (typeof window === "undefined") return;
    set({
      soundEnabled: localStorage.getItem("notification-sound") !== "false",
      desktopEnabled: localStorage.getItem("notification-desktop") !== "false",
    });
  },
}));
