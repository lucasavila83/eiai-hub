"use client";

import { useState, useEffect, useCallback } from "react";

interface NotifOptions {
  body?: string;
  icon?: string;
  tag?: string;
  link?: string;
}

export function useDesktopNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    localStorage.setItem("notification-permission-requested", "true");
  }, []);

  const showNotification = useCallback(
    (title: string, opts: NotifOptions = {}) => {
      const enabled = localStorage.getItem("notification-desktop") !== "false";
      if (!enabled) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (document.hasFocus()) return; // Don't show if tab is focused

      const notif = new Notification(title, {
        body: opts.body,
        icon: opts.icon || "/lesco-icon.png",
        tag: opts.tag || "lesco-hub-" + Date.now(),
        silent: true, // We handle sound separately
      });

      notif.onclick = () => {
        window.focus();
        if (opts.link) {
          window.location.href = opts.link;
        }
        notif.close();
      };

      // Auto close after 5s
      setTimeout(() => notif.close(), 5000);
    },
    []
  );

  return { permission, requestPermission, showNotification };
}
