"use client";

import { useRef, useCallback, useEffect } from "react";

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    audioRef.current = new Audio("/sounds/notification-pop.wav");
    audioRef.current.volume = 0.6;
    audioRef.current.preload = "auto";

    // Unlock audio on first user interaction (required by browsers)
    function unlockAudio() {
      if (unlockedRef.current) return;
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current!.pause();
          audioRef.current!.currentTime = 0;
          unlockedRef.current = true;
        }).catch(() => {});
      }
    }

    document.addEventListener("click", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      audioRef.current = null;
    };
  }, []);

  const playSound = useCallback(() => {
    const enabled = localStorage.getItem("notification-sound") !== "false";
    if (!enabled || !audioRef.current) return;

    const audio = audioRef.current.cloneNode(true) as HTMLAudioElement;
    audio.volume = 0.6;
    audio.play().catch(() => {
      // Autoplay still blocked — try again on next interaction
      unlockedRef.current = false;
    });
  }, []);

  return { playSound };
}
