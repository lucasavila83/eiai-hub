"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PresenceTracker } from "@/components/layout/PresenceTracker";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const [profileRes, orgsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("org_members").select("organizations(*)").eq("user_id", user.id),
      ]);

      const orgs = orgsRes.data?.map((o: any) => o.organizations).filter(Boolean) ?? [];

      if (orgs.length === 0) {
        router.replace("/register");
        return;
      }

      setProfile(profileRes.data);
      setOrganizations(orgs);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {userId && <PresenceTracker userId={userId} currentStatus={profile?.status || "online"} />}
      <Sidebar profile={profile} organizations={organizations} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar profile={profile} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
