"use client";

/**
 * PushNotificationsPrompt
 *
 * Asks the user for permission to send push notifications, then registers a
 * browser subscription and POSTs it to /api/push/subscribe so the server
 * can push chat messages, mentions, and task events.
 *
 * Shown as a small banner near the top once per device. Stays silent if:
 *   - notifications aren't supported (desktop Safari < 16, some WebViews)
 *   - permission already granted (we just make sure the sub is fresh)
 *   - permission already denied
 *   - user dismissed the prompt within the last 30 days
 */

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const DISMISS_KEY = "push_prompt_dismissed_at";
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function supportsPush(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registerSubscription(): Promise<boolean> {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    // eslint-disable-next-line no-console
    console.warn("[push] VAPID public key missing");
    return false;
  }

  // Wait for the service worker to be ready
  const reg = await navigator.serviceWorker.ready;

  // If already subscribed, just make sure it's synced with the server
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapidPublic),
    });
  }

  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });

  return true;
}

export function PushNotificationsPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supportsPush()) return;

    // If permission already granted, silently (re)register the subscription
    // so the server has an up-to-date endpoint.
    if (Notification.permission === "granted") {
      registerSubscription().catch(() => {});
      return;
    }
    if (Notification.permission === "denied") return;

    // Respect recent dismissals
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissed < DISMISS_COOLDOWN_MS) return;

    // Small delay so it doesn't pop up during the initial paint
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await registerSubscription();
      } else {
        // Don't ask again for a while
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } finally {
      setBusy(false);
      setShow(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-card border border-border rounded-2xl shadow-2xl p-4 z-[99] animate-in slide-in-from-top-4 duration-300">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Ativar notificações</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Receba avisos de novas mensagens mesmo com o app fechado.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              {busy ? "Habilitando..." : "Ativar"}
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
