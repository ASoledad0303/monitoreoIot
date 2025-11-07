import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

/**
 * Cambia la contraseña del usuario autenticado
 * POST /api/auth/change-password
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    // Validar que la nueva contraseña tenga los requisitos
    const hasNum = /\d/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    if (!hasNum || !hasSpecial) {
      return NextResponse.json(
        { error: "La contraseña debe incluir números y caracteres especiales" },
        { status: 400 }
      );
    }

    // Obtener hash actual del usuario
    const userData = await query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.sub]
    );

    if (userData.rows.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Verificar contraseña actual
    const isValid = await bcrypt.compare(
      currentPassword,
      userData.rows[0].password_hash
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Contraseña actual incorrecta" },
        { status: 401 }
      );
    }

    // Hashear nueva contraseña
    const newHash = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newHash,
      user.sub,
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error cambiando contraseña:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}


