import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";

/**
 * Obtiene la lista de usuarios (solo administradores)
 * GET /api/users
 */
export async function GET(req: NextRequest) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    // Obtener usuarios (sin password_hash por seguridad)
    const result = await query<{
      id: number;
      name: string;
      email: string;
      role: string;
      email_verified: boolean;
      created_at: Date;
    }>(
      `SELECT id, name, email, role, email_verified, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ users: result.rows });
  } catch (e) {
    console.error("Error obteniendo usuarios:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

