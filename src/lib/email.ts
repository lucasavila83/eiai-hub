import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

const FROM = process.env.EMAIL_FROM || "Lesco-Hub <noreply@lesco.com.br>";

export function inviteEmailHtml(inviteUrl: string, orgName: string, inviterName: string, isReminder = false) {
  const actionText = isReminder
    ? `<strong>${inviterName}</strong> reenviou o convite para você fazer parte da organização <strong>${orgName}</strong> no Lesco-Hub.`
    : `<strong>${inviterName}</strong> convidou você para fazer parte da organização <strong>${orgName}</strong> no Lesco-Hub.`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">Lesco-Hub</h1>
        <p style="color: #666; font-size: 14px; margin-top: 4px;">Plataforma de gestão integrada</p>
      </div>

      <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Olá!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
          ${actionText}
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
        Enviado por Lesco-Hub
      </p>
    </div>
  `;
}

export async function sendInviteEmail(
  to: string,
  inviteUrl: string,
  orgName: string,
  inviterName: string,
  isReminder = false
): Promise<boolean> {
  try {
    const subject = isReminder
      ? `Lembrete: Você foi convidado para ${orgName} — Lesco-Hub`
      : `Você foi convidado para ${orgName} — Lesco-Hub`;

    const { error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html: inviteEmailHtml(inviteUrl, orgName, inviterName, isReminder),
    });

    if (error) {
      console.error("Erro ao enviar email (Resend):", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Erro ao enviar email (Resend):", err);
    return false;
  }
}
