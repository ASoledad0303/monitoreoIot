import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { sendMail, render2FAEmail } from "@/lib/mailer";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const res = await query<{
      id: number;
      email: string;
      password_hash: string;
      name: string;
      email_verified: boolean;
      role: string;
    }>(
      `SELECT u.id, u.email, u.password_hash, u.name, u.email_verified, r.name as role 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.email = $1`,
      [email]
    );

    const user = res.rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (!user.email_verified) {
      return NextResponse.json(
        { error: "Correo no verificado" },
        { status: 403 }
      );
    }

    // Generar código 2FA
    const code2FA = genCode();
    const expiresInMin = 10;
    await query(
      `INSERT INTO user_tokens (user_id, type, code, expires_at)
       VALUES ($1, '2fa', $2, NOW() + INTERVAL '${expiresInMin} minutes')`,
      [user.id, code2FA]
    );

    // Enviar código 2FA por correo (no esperar, para evitar timeouts)
    // El email se envía de forma asíncrona sin bloquear la respuesta
    sendMail(
      email,
      "Código de verificación de dos factores",
      render2FAEmail(code2FA)
    ).catch((err) => {
      console.error("[login] Error enviando email 2FA:", err);
      // No fallar el login si el email falla
    });

    // Retornar respuesta indicando que se requiere 2FA (sin crear token de sesión)
    return NextResponse.json({
      ok: true,
      requires2FA: true,
      email: email, // Enviar email para el siguiente paso
    });
  } catch (e) {
    console.error("Error en login:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
