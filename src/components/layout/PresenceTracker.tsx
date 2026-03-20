"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  currentStatus: string;
}

/**
 * Tracks user presence automatically.
 * - Sets status to "online" when page loads (unless manually set to "away" or "dnd")
 * - Sets status to "offline" when page closes/navigates away
 * - Updates last_seen_at periodically
 */
export function PresenceTracker({ userId, currentStatus }: Props) {
  useEffect(() => {
    const supabase = createClient();
    const isManualStatus = currentStatus === "away" || currentStatus === "dnd";

    // Set online when page loads (only if not manually set to away/dnd)
    if (!isManualStatus) {
      supabase
        .from("profiles")
        .update({ status: "online", last_seen_at: new Date().toISOString() })
        .eq("id", userId)
        .then();
    } else {
      // Still update last_seen_at even if manual status
      supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId)
        .then();
    }

    // Update last_seen_at every 60 seconds
    const interval = setInterval(() => {
      supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId)
        .then();
    }, 60000);

    // Set offline when page closes
    function handleBeforeUnload() {
      // Use sendBeacon for reliability on page close
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`;
      const headers = {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
        Prefer: "return=minimal",
      };
      // sendBeacon doesn't support custom headers in all browsers,
      // so we also try a regular fetch with keepalive
      try {
        fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "offline", last_seen_at: new Date().toISOString() }),
          keepalive: true,
        });
      } catch {
        // Fallback: at least try
      }
    }

    // Set offline on visibility change (tab hidden)
    function handleVisibilityChange() {
      if (document.hidden) {
        // Don't change manual statuses
        if (currentStatus !== "away" && currentStatus !== "dnd") {
          supabase
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", userId)
            .then();
        }
      } else {
        // Tab visible again - set back to online (unless manual status)
        if (currentStatus !== "away" && currentStatus !== "dnd") {
          supabase
            .from("profiles")
            .update({ status: "online", last_seen_at: new Date().toISOString() })
            .eq("id", userId)
            .then();
        }
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, currentStatus]);

  return null; // This component renders nothing
}
