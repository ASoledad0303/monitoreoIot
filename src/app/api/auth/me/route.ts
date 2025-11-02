import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/middleware-helpers";

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

    return NextResponse.json({
      id: user.sub,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (e) {
    console.error("Error en /api/auth/me:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

