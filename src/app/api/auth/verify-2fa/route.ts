import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { signToken } from "@/lib/jwt";

const Schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { email, code } = parsed.data;

    // Buscar usuario
    const u = await query<{
      id: number;
      email: string;
      name: string;
      role: string;
    }>("SELECT id, email, name, role FROM users WHERE email = $1", [email]);
    const user = u.rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Buscar código 2FA válido
    const tok = await query<{ id: number }>(
      `SELECT id FROM user_tokens
       WHERE user_id = $1 AND type = '2fa' AND code = $2 AND used = false AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id, code]
    );
    const t = tok.rows[0];
    if (!t) {
      return NextResponse.json(
        { error: "Código inválido o vencido" },
        { status: 400 }
      );
    }

    // Marcar código como usado
    await query("UPDATE user_tokens SET used = true WHERE id = $1", [t.id]);

    // Crear token de sesión con role
    const token = signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || "user", // Default a 'user' si no tiene role
    });
    const resp = NextResponse.json({ ok: true });
    resp.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return resp;
  } catch (e) {
    console.error("Error en verify-2fa:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
