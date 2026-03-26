"use client";

import { createPortal } from "react-dom";
import { X, MessageCircle, Bell } from "lucide-react";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useRouter } from "next/navigation";
import { getInitials, generateColor } from "@/lib/utils/helpers";

export function ToastNotifications() {
  const toasts = useNotificationStore((s) => s.toasts);
  const removeToast = useNotificationStore((s) => s.removeToast);
  const router = useRouter();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
      {toasts.map((toast) => {
        const isChat = toast.link?.includes("/chat");
        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-card border border-border rounded-xl shadow-2xl p-3 flex gap-3 items-start animate-in slide-in-from-right duration-300 cursor-pointer hover:bg-accent/50 transition-colors"
          >
            {/* Avatar or icon */}
            {toast.senderAvatar ? (
              <img
                src={toast.senderAvatar}
                alt={toast.title}
                className="w-9 h-9 rounded-full object-cover shrink-0"
                onClick={() => {
                  if (toast.link) router.push(toast.link);
                  removeToast(toast.id);
                }}
              />
            ) : isChat ? (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: generateColor(toast.title) }}
                onClick={() => {
                  if (toast.link) router.push(toast.link);
                  removeToast(toast.id);
                }}
              >
                {getInitials(toast.title)}
              </div>
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"
                onClick={() => {
                  if (toast.link) router.push(toast.link);
                  removeToast(toast.id);
                }}
              >
                <Bell className="w-4 h-4 text-primary" />
              </div>
            )}

            {/* Content */}
            <div
              className="flex-1 min-w-0"
              onClick={() => {
                if (toast.link) router.push(toast.link);
                removeToast(toast.id);
              }}
            >
              <p className="text-sm font-semibold text-foreground truncate">{toast.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{toast.body}</p>
            </div>

            {/* Close */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
