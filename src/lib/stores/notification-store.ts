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

interface NotificationState {
  unreadCount: number;
  recentNotifications: NotificationItem[];
  soundEnabled: boolean;
  desktopEnabled: boolean;
  dropdownOpen: boolean;

  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  addNotification: (item: NotificationItem) => void;
  setRecentNotifications: (items: NotificationItem[]) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setDesktopEnabled: (enabled: boolean) => void;
  setDropdownOpen: (open: boolean) => void;
  loadPreferences: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  recentNotifications: [],
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

  setRecentNotifications: (items) => set({ recentNotifications: items }),

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
