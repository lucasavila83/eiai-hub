"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RootDashboard() {
  const router = useRouter();

  useEffect(() => {
    // Landing on "/" drops the user straight into chat — that's where
    // they spend most of their time and what the PWA start_url now
    // points at (manifest.json). Keeps desktop and mobile consistent.
    router.replace("/chat");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
