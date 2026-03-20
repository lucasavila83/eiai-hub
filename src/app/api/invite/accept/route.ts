import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Also try Authorization header
    let userId = user?.id;
    if (!userId) {
      const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
      if (authHeader) {
        const { data } = await adminClient.auth.getUser(authHeader);
        userId = data.user?.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { token } = await req.json();

    // Find invitation
    const { data: invitation } = await adminClient
      .from("invitations")
      .select("*, organizations(name)")
      .eq("token", token)
      .is("accepted_at", null)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: "Convite não encontrado ou já aceito" }, { status: 404 });
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: "Convite expirado" }, { status: 410 });
    }

    // Check if already a member
    const { data: existing } = await adminClient
      .from("org_members")
      .select("id")
      .eq("org_id", invitation.org_id)
      .eq("user_id", userId)
      .single();

    if (existing) {
      // Mark invitation as accepted anyway
      await adminClient
        .from("invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);
      return NextResponse.json({ message: "Já é membro", org_id: invitation.org_id });
    }

    // Add as org member
    await adminClient.from("org_members").insert({
      org_id: invitation.org_id,
      user_id: userId,
      role: invitation.role,
      invited_by: invitation.invited_by,
    });

    // Mark invitation as accepted
    await adminClient
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    // Add to #geral channel if exists
    const { data: geralChannel } = await adminClient
      .from("channels")
      .select("id")
      .eq("org_id", invitation.org_id)
      .eq("name", "geral")
      .single();

    if (geralChannel) {
      await adminClient.from("channel_members").insert({
        channel_id: geralChannel.id,
        user_id: userId,
        last_read_at: new Date().toISOString(),
        notifications: "all",
      });
    }

    return NextResponse.json({
      message: "Convite aceito!",
      org_id: invitation.org_id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
