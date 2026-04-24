import { create } from "zustand";
import type { Channel, Message } from "@/lib/types/database";

interface ChatState {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  unreadCounts: Record<string, number>;
  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (channelId: string | null) => void;
  addMessage: (channelId: string, message: Message) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  updateMessage: (channelId: string, messageId: string, updates: Partial<Message>) => void;
  setUnreadCount: (channelId: string, count: number) => void;
  /** Batch-set all unread counts at once. Only triggers a re-render if the
   *  counts actually changed (shallow compare) — used by the polling to
   *  avoid re-rendering the whole sidebar every 15s. */
  setAllUnreadCounts: (counts: Record<string, number>) => void;
  incrementUnread: (channelId: string) => void;
  markAsRead: (channelId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  unreadCounts: {},
  setChannels: (channels) =>
    set((state) => {
      // Idempotency guard: loadChannels() in the sidebar runs on every
      // realtime event that touches the channels table. Without this
      // check, each of those events would create a brand-new `channels`
      // array reference → re-render every <Link> in the sidebar → swallow
      // any click that lands in that window ("need to click twice" bug).
      const prev = state.channels;
      if (prev.length !== channels.length) return { channels };
      const prevById = new Map(prev.map((c) => [c.id, c]));
      for (const c of channels) {
        const p = prevById.get(c.id);
        if (
          !p ||
          p.name !== c.name ||
          p.type !== c.type ||
          (p as any).description !== (c as any).description ||
          (p as any).is_archived !== (c as any).is_archived
        ) {
          return { channels };
        }
      }
      return {}; // no change
    }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  addMessage: (channelId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), message],
      },
    })),
  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [channelId]: messages },
    })),
  updateMessage: (channelId, messageId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),
  setUnreadCount: (channelId, count) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: count },
    })),
  setAllUnreadCounts: (counts) =>
    set((state) => {
      const prev = state.unreadCounts;
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(counts);
      if (prevKeys.length === newKeys.length && newKeys.every((k) => prev[k] === counts[k])) {
        return {}; // no change — no re-render
      }
      return { unreadCounts: counts };
    }),
  incrementUnread: (channelId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] || 0) + 1,
      },
    })),
  markAsRead: (channelId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    })),
}));
