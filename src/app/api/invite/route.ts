import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendInviteEmail(to: string, inviteUrl: string, orgName: string, inviterName: string) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "EIAI Hub <noreply@eiai.com>",
      to,
      subject: `Você foi convidado para ${orgName} — EIAI Hub`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">EIAI Hub</h1>
            <p style="color: #666; font-size: 14px; margin-top: 4px;">Plataforma de gestão integrada</p>
          </div>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Olá!</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
              <strong>${inviterName}</strong> convidou você para fazer parte da organização
              <strong>${orgName}</strong> no EIAI Hub.
            </p>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${inviteUrl}"
               style="display: inline-block; background: #76a493; color: white; text-decoration: none;
                      padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Aceitar convite
            </a>
          </div>

          <p style="color: #999; font-size: 12px; text-align: center;">
            Este convite expira em 7 dias.<br>
            Se você não esperava este convite, ignore este email.
          </p>

          <p style="color: #ccc; font-size: 11px; text-align: center; margin-top: 32px;">
            Enviado por EIAI Hub
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Erro ao enviar email de convite:", err);
    return false;
  }
}

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
