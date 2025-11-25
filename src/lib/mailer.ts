import nodemailer from "nodemailer";
import { query } from "@/lib/db";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || "no-reply@tesis-iot.local";

/**
 * Agrega un email a la cola para ser procesado por el worker en segundo plano
 */
export async function queueEmail(to: string, subject: string, html: string) {
  try {
    const result = await query(
      `INSERT INTO email_queue (to_email, subject, html, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [to, subject, html]
    );
    console.log(`[mailer] Email agregado a la cola (ID: ${result.rows[0].id}) para ${to}`);
    return { queued: true, id: result.rows[0].id };
  } catch (error) {
    console.error("[mailer] Error agregando email a la cola:", error);
    throw error;
  }
}

/**
 * Envía un email directamente usando SMTP (usado por el worker)
 */
export async function sendMail(to: string, subject: string, html: string) {
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[mailer] SMTP no configurado. Simulando envío a", to);
    console.warn("[mailer] Asunto:", subject);
    console.warn("[mailer] HTML:", html);
    return { simulated: true };
  }

  console.log("[mailer] Intentando conectar a SMTP:", {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    from: mailFrom,
    to: to,
  });

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true para 465, false para otros puertos
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000, // 10 segundos timeout para conexión
    socketTimeout: 10000, // 10 segundos timeout para operaciones
    tls: {
      // No rechazar conexiones no autorizadas (útil para desarrollo)
      rejectUnauthorized: false,
    },
  });

  try {
    console.log("[mailer] Verificando conexión SMTP...");
    await transporter.verify();
    console.log("[mailer] Conexión SMTP verificada exitosamente");
  } catch (verifyError) {
    console.error("[mailer] Error verificando conexión SMTP:", verifyError);
    throw verifyError;
  }

  console.log("[mailer] Enviando email...");
  const info = await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    html,
  });
  console.log(
    "[mailer] Email enviado exitosamente. MessageId:",
    info.messageId
  );
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
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
              <tr>
                <td style="padding:40px 30px;text-align:center;background-color:#1976d2;border-radius:8px 8px 0 0">
                  <h1 style="margin:0;color:#ffffff;font-size:24px">Restablecer Contraseña</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 30px">
                  <p style="margin:0 0 20px 0;font-size:16px;color:#333333;line-height:1.6">
                    Has solicitado restablecer tu contraseña. Utiliza el siguiente código para completar el proceso:
                  </p>
                  <div style="background-color:#f0f0f0;border:2px dashed #1976d2;border-radius:8px;padding:20px;text-align:center;margin:30px 0">
                    <h2 style="margin:0;font-size:32px;letter-spacing:4px;color:#1976d2;font-family:'Courier New',monospace">${code}</h2>
                  </div>
                  <p style="margin:20px 0 0 0;font-size:14px;color:#666666;line-height:1.6">
                    ⚠️ Este código expira en <strong>15 minutos</strong>. Si no solicitaste este cambio, puedes ignorar este correo.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 30px;background-color:#f9f9f9;border-radius:0 0 8px 8px;text-align:center;border-top:1px solid #e0e0e0">
                  <p style="margin:0;font-size:12px;color:#999999">
                    Sistema de Monitoreo IoT - Tesis
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export function render2FAEmail(code: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
              <tr>
                <td style="padding:40px 30px;text-align:center;background-color:#10b981;border-radius:8px 8px 0 0">
                  <h1 style="margin:0;color:#ffffff;font-size:24px">🔐 Código de Verificación</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 30px">
                  <p style="margin:0 0 20px 0;font-size:16px;color:#333333;line-height:1.6">
                    Se ha iniciado sesión en tu cuenta. Para completar el acceso, ingresa el siguiente código de verificación:
                  </p>
                  <div style="background-color:#f0fdf4;border:2px dashed #10b981;border-radius:8px;padding:20px;text-align:center;margin:30px 0">
                    <h2 style="margin:0;font-size:32px;letter-spacing:4px;color:#10b981;font-family:'Courier New',monospace">${code}</h2>
                  </div>
                  <p style="margin:20px 0 0 0;font-size:14px;color:#666666;line-height:1.6">
                    ⚠️ Este código expira en <strong>10 minutos</strong>. Si no iniciaste sesión, cambia tu contraseña inmediatamente.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 30px;background-color:#f9f9f9;border-radius:0 0 8px 8px;text-align:center;border-top:1px solid #e0e0e0">
                  <p style="margin:0;font-size:12px;color:#999999">
                    Sistema de Monitoreo IoT - Tesis
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
