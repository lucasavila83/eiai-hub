"use client";

import { useRef, useCallback, useEffect } from "react";

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Preload audio
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sounds/notification.wav");
      audioRef.current.volume = 0.5;
      audioRef.current.preload = "auto";
    }
    return () => {
      audioRef.current = null;
    };
  }, []);

  const playSound = useCallback(() => {
    const enabled = localStorage.getItem("notification-sound") !== "false";
    if (!enabled || !audioRef.current) return;

    // Clone and play to allow overlapping sounds
    const audio = audioRef.current.cloneNode(true) as HTMLAudioElement;
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Autoplay blocked — ignore silently
    });
  }, []);

  return { playSound };
}
