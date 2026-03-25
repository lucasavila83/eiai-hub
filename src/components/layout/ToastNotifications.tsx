"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, MessageCircle, Bell } from "lucide-react";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useRouter } from "next/navigation";

export function ToastNotifications() {
  const toasts = useNotificationStore((s) => s.toasts);
  const removeToast = useNotificationStore((s) => s.removeToast);
  const router = useRouter();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-white border border-gray-200 rounded-xl shadow-lg p-4 flex gap-3 items-start animate-in slide-in-from-right duration-300"
          style={{ animation: "slideIn 0.3s ease-out" }}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            {toast.link?.includes("/chat") ? (
              <MessageCircle className="w-4 h-4 text-primary" />
            ) : (
              <Bell className="w-4 h-4 text-primary" />
            )}
          </div>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => {
              if (toast.link) router.push(toast.link);
              removeToast(toast.id);
            }}
          >
            <p className="text-sm font-semibold text-gray-900 truncate">{toast.title}</p>
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{toast.body}</p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
