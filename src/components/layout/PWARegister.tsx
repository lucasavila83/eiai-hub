"use client";

/**
 * PWA service worker registration + install prompt banner.
 *
 * Responsibilities:
 *   - Register /sw.js on mount (only in production / HTTPS).
 *   - Capture the `beforeinstallprompt` event (Android/Chrome) and expose
 *     a "Instalar app" banner at the bottom of the screen.
 *   - Detect iOS Safari (which has no beforeinstallprompt) and show a
 *     tailored tutorial ("aperte Compartilhar → Adicionar à Tela de Início").
 *   - Remember when the user dismisses the banner (localStorage) so we
 *     don't nag them on every page load — re-shown once every 7 days.
 */

import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
};

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on modern iOS reports as Mac; check touch + maxTouchPoints as well
  return (
    /iphone|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && "ontouchend" in document)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Android / desktop
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-expect-error — non-standard iOS property
  if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
  return false;
}

export function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Register the service worker — deferred until after the page has loaded
  // so SW registration can never block the initial render on slow mobile
  // networks.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Only register on secure origins (localhost is treated as secure)
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    function register() {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // eslint-disable-next-line no-console
          console.log("[PWA] service worker registered:", reg.scope);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[PWA] service worker registration failed:", err);
        });
    }

    // Wait until the page is fully loaded (or 5s as a cap) before registering.
    if (document.readyState === "complete") {
      setTimeout(register, 1500);
    } else {
      const onLoad = () => setTimeout(register, 1500);
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  // Catch the install prompt (Android/Chrome/Edge)
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Respect recent dismissals
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() - dismissed < DISMISS_COOLDOWN_MS) return;

      setShowBanner(true);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setShowBanner(false);
      localStorage.removeItem(DISMISS_KEY);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // iOS fallback: show custom tutorial when we detect iOS Safari not in standalone mode
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (!isIOS()) return;

    // Only on small screens (phones/tablets) — don't bug desktop Safari users
    if (window.innerWidth > 900) return;

    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissed < DISMISS_COOLDOWN_MS) return;

    // Small delay so it doesn't pop up during initial paint
    const t = setTimeout(() => setShowIOSHelp(true), 4000);
    return () => clearTimeout(t);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } finally {
      setDeferredPrompt(null);
      setShowBanner(false);
      setInstalling(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowBanner(false);
    setShowIOSHelp(false);
  }

  // Already installed? Render nothing.
  if (typeof window !== "undefined" && isStandalone()) return null;

  // Android / Chrome / Edge banner
  if (showBanner && deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-card border border-border rounded-2xl shadow-2xl p-4 z-[100] animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Instalar Lesco-Hub</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acesse mais rápido, receba notificações e use em tela cheia no seu celular.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                disabled={installing}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {installing ? "Instalando..." : "Instalar"}
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

  // iOS tutorial (no native prompt available)
  if (showIOSHelp) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-card border border-border rounded-2xl shadow-2xl p-4 z-[100] animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Instalar no iPhone/iPad</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Para instalar o Lesco-Hub como app:
            </p>
            <ol className="text-xs text-foreground mt-2 space-y-1.5">
              <li className="flex items-center gap-1.5">
                <span className="text-muted-foreground">1.</span>
                Toque em <Share className="w-3.5 h-3.5 inline-block text-blue-500" /> <span className="text-muted-foreground">(Compartilhar)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-muted-foreground">2.</span>
                <Plus className="w-3.5 h-3.5 inline-block" /> Adicionar à Tela de Início
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-muted-foreground">3.</span>
                Abra pelo ícone — pronto!
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
