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

    // Send email
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "EIAI Hub <noreply@eiai.com>",
        to: invitation.email,
        subject: `Lembrete: Você foi convidado para ${orgName} — EIAI Hub`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">EIAI Hub</h1>
              <p style="color: #666; font-size: 14px; margin-top: 4px;">Plataforma de gestão integrada</p>
            </div>

            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Olá!</p>
              <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
                <strong>${inviterName}</strong> reenviou o convite para você fazer parte da organização
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
              Este convite expira em 7 dias a partir da data original.<br>
              Se você não esperava este convite, ignore este email.
            </p>

            <p style="color: #ccc; font-size: 11px; text-align: center; margin-top: 32px;">
              Enviado por EIAI Hub
            </p>
          </div>
        `,
      });

      return NextResponse.json({
        success: true,
        inviteUrl,
        message: `Email reenviado para ${invitation.email}`,
      });
    } catch (emailErr) {
      console.error("Erro ao reenviar email:", emailErr);
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
