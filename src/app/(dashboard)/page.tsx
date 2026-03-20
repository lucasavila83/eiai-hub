"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Loader2 } from "lucide-react";

export default function RootDashboard() {
  const router = useRouter();
  const { user, orgId, supabase } = useAuth();

  useEffect(() => {
    if (!orgId) return;

    (async () => {
      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", "public")
        .limit(1)
        .single();

      if (channel) {
        router.replace(`/chat/${channel.id}`);
      } else {
        router.replace("/chat");
      }
    })();
  }, [orgId]);

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
