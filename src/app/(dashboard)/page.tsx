import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, organizations(id)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/register");

  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("org_id", membership.org_id)
    .eq("type", "public")
    .limit(1)
    .single();

  if (channel) redirect(`/chat/${channel.id}`);
  redirect("/chat");
}
