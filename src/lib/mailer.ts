import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || 'no-reply@tesis-iot.local';

export async function sendMail(to: string, subject: string, html: string) {
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[mailer] SMTP no configurado. Simulando envío a', to);
    console.warn('[mailer] Asunto:', subject);
    console.warn('[mailer] HTML:', html);
    return { simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const info = await transporter.sendMail({ from: mailFrom, to, subject, html });
  return { messageId: info.messageId };
}

export function renderVerificationEmail(code: string) {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#222">
      <p>Tu código de verificación es:</p>
      <h2 style="margin:8px 0">${code}</h2>
      <p>Este código vence en 15 minutos.</p>
    </div>
  `;
}

export function renderResetEmail(code: string) {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#222">
      <p>Tu código para restablecer la contraseña es:</p>
      <h2 style="margin:8px 0">${code}</h2>
      <p>Este código vence en 15 minutos.</p>
    </div>
  `;
}