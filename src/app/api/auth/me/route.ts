import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";

/**
 * Obtiene la información del usuario autenticado desde el token JWT
 */
export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // Obtener company_id del usuario desde la BD
    const userData = await query<{ company_id: number | null }>(
      "SELECT company_id FROM users WHERE id = $1",
      [user.sub]
    );

    return NextResponse.json({
      id: user.sub,
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: userData.rows[0]?.company_id || null,
    });
  } catch (e) {
    console.error("Error en /api/auth/me:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

