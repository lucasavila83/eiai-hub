import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { invitationId } = await req.json();

    if (!invitationId) {
      return NextResponse.json({ error: "invitationId é obrigatório" }, { status: 400 });
    }

    // Fetch the invitation
    const { data: invitation, error: invErr } = await adminClient
      .from("invitations")
      .select("*")
      .eq("id", invitationId)
      .is("accepted_at", null)
      .single();

    if (invErr || !invitation) {
      return NextResponse.json({ error: "Convite não encontrado ou já aceito" }, { status: 404 });
    }

    // Verify user is admin/owner of the org
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("org_id", invitation.org_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Build invite URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inviteUrl = `${appUrl}/invite/${invitation.token}`;

    // Get org name and inviter name
    const [orgRes, profileRes] = await Promise.all([
      adminClient.from("organizations").select("name").eq("id", invitation.org_id).single(),
      adminClient.from("profiles").select("full_name, email").eq("id", user.id).single(),
    ]);

    const orgName = orgRes.data?.name || "Organização";
    const inviterName = profileRes.data?.full_name || profileRes.data?.email || "Um administrador";

    // Send email (as reminder)
    const emailSent = await sendInviteEmail(invitation.email, inviteUrl, orgName, inviterName, true);

    if (emailSent) {
      return NextResponse.json({
        success: true,
        inviteUrl,
        message: `Email reenviado para ${invitation.email}`,
      });
    } else {
      return NextResponse.json({
        success: false,
        inviteUrl,
        message: "Não foi possível enviar o email. Use o link para convidar manualmente.",
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
