import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, UserRole, hasAnyRole } from "./auth";

/**
 * Obtiene el usuario desde el token de la cookie
 */
export function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  return getUserFromToken(token || undefined);
}

/**
 * Middleware helper que verifica si el usuario está autenticado
 */
export function requireAuth(req: NextRequest): NextResponse | null {
  const user = getAuthUser(req);
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return null;
}

/**
 * Middleware helper que verifica si el usuario tiene un rol específico
 */
export function requireRole(req: NextRequest, roles: UserRole | UserRole[]): NextResponse | null {
  const user = getAuthUser(req);
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const rolesArray = Array.isArray(roles) ? roles : [roles];
  const token = req.cookies.get("auth_token")?.value;
  
  if (!hasAnyRole(token || undefined, rolesArray)) {
    return NextResponse.json(
      { error: "No tienes permisos para acceder a este recurso" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Middleware helper que verifica si el usuario es administrador (admin o super_admin)
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  return requireRole(req, ["admin", "super_admin"]);
}

/**
 * Middleware helper que verifica si el usuario es super administrador
 */
export function requireSuperAdmin(req: NextRequest): NextResponse | null {
  return requireRole(req, "super_admin");
}

