"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function RootDashboard() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) {
        router.replace("/register");
        return;
      }

      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("org_id", membership.org_id)
        .eq("type", "public")
        .limit(1)
        .single();

      if (channel) {
        router.replace(`/chat/${channel.id}`);
      } else {
        router.replace("/chat");
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
