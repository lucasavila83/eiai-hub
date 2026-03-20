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
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
    }

    const userId = user?.id;
    const { email, orgId, role = "member" } = await req.json();

    if (!email || !orgId) {
      return NextResponse.json({ error: "Email e orgId são obrigatórios" }, { status: 400 });
    }

    // Verify user is admin/owner of the org
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Check if user already member
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (existingProfile) {
      const { data: existingMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", existingProfile.id)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: "Usuário já é membro" }, { status: 409 });
      }
    }

    // Create invitation
    const { data: invitation, error } = await adminClient
      .from("invitations")
      .insert({
        org_id: orgId,
        email,
        role,
        invited_by: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build invite URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inviteUrl = `${appUrl}/invite/${invitation.token}`;

    // Get org name and inviter name for the email
    const [orgRes, profileRes] = await Promise.all([
      adminClient.from("organizations").select("name").eq("id", orgId).single(),
      adminClient.from("profiles").select("full_name, email").eq("id", userId).single(),
    ]);

    const orgName = orgRes.data?.name || "Organização";
    const inviterName = profileRes.data?.full_name || profileRes.data?.email || "Um administrador";

    // Send email
    const emailSent = await sendInviteEmail(email, inviteUrl, orgName, inviterName);

    return NextResponse.json({
      invitation,
      inviteUrl,
      emailSent,
      message: emailSent
        ? `Convite enviado por email para ${email}`
        : `Convite criado. O email não pôde ser enviado — compartilhe o link manualmente.`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
