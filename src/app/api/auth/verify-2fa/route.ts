import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { COMPANY_CONFIG, ROLES } from "@/lib/config";

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

    // Obtener URL de redirect desde query params o body, o usar "/"
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get("redirect") || body.redirect || "/";

    // Buscar usuario
    const u = await query<{
      id: number;
      email: string;
      name: string;
      role: string;
      company_id: number | null;
    }>(
      `SELECT u.id, u.email, u.name, r.name as role, u.company_id 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.email = $1`,
      [email]
    );
    const user = u.rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Si es admin y no tiene company, crear una automáticamente
    if (
      COMPANY_CONFIG.ENABLED &&
      user.role === ROLES.ADMIN &&
      !user.company_id
    ) {
      // Generar código automático basado en el nombre del usuario
      const namePrefix = user.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .substring(0, 3)
        .padEnd(3, "X");

      // Buscar último código con ese prefijo
      const lastCodeResult = await query<{ code: string }>(
        `SELECT code FROM companies 
         WHERE code LIKE $1 
         ORDER BY code DESC 
         LIMIT 1`,
        [`${namePrefix}%`]
      );

      let companyCode: string;
      if (lastCodeResult.rows.length > 0) {
        const lastCode = lastCodeResult.rows[0].code;
        const match = lastCode.match(/^([A-Z0-9]+)(\d+)$/);
        if (match && match[1] === namePrefix) {
          const num = parseInt(match[2], 10) + 1;
          companyCode = `${namePrefix}${num.toString().padStart(3, "0")}`;
        } else {
          companyCode = `${namePrefix}001`;
        }
      } else {
        companyCode = `${namePrefix}001`;
      }

      // Crear company automáticamente
      const companyResult = await query<{ id: number }>(
        `INSERT INTO companies (name, code) 
         VALUES ($1, $2) 
         RETURNING id`,
        [`Company de ${user.name}`, companyCode]
      );

      // Asignar company al usuario
      await query("UPDATE users SET company_id = $1 WHERE id = $2", [
        companyResult.rows[0].id,
        user.id,
      ]);

      // Actualizar user.company_id para el token
      user.company_id = companyResult.rows[0].id;
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

    // Crear respuesta de redirect HTTP
    // El navegador seguirá automáticamente el redirect con la cookie ya establecida
    const redirectUrl = new URL(redirectTo, req.url);
    const resp = NextResponse.redirect(redirectUrl, { status: 307 });

    // Establecer cookie antes del redirect
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
