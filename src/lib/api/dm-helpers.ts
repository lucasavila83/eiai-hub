import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Finds the DM channel id between userA and userB in the given org.
 * Returns null if no such DM exists.
 */
export async function findDmChannel(
  admin: SupabaseClient<Database>,
  orgId: string,
  userA: string,
  userB: string
): Promise<string | null> {
  const { data: userAChannels } = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", userA);

  const aIds = (userAChannels || []).map((c: any) => c.channel_id);
  if (aIds.length === 0) return null;

  const { data: shared } = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", userB)
    .in("channel_id", aIds);

  const sharedIds = (shared || []).map((s: any) => s.channel_id);
  if (sharedIds.length === 0) return null;

  const { data: dm } = await admin
    .from("channels")
    .select("id")
    .eq("type", "dm")
    .eq("org_id", orgId)
    .in("id", sharedIds)
    .limit(1)
    .maybeSingle();

  return dm?.id || null;
}

/**
 * Creates a DM channel between userA and userB (if not exists) and returns its id.
 */
export async function ensureDmChannel(
  admin: SupabaseClient<Database>,
  orgId: string,
  userA: string,
  userB: string,
  dmName: string
): Promise<string | null> {
  const existing = await findDmChannel(admin, orgId, userA, userB);
  if (existing) return existing;

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      org_id: orgId,
      name: dmName,
      type: "dm",
      created_by: userA,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error || !channel) return null;

  const now = new Date().toISOString();
  await admin.from("channel_members").insert([
    { channel_id: channel.id, user_id: userA, last_read_at: now, notifications: "all" },
    { channel_id: channel.id, user_id: userB, last_read_at: now, notifications: "all" },
  ]);

  return channel.id;
}
