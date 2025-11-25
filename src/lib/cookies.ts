import { NextRequest } from "next/server";

/**
 * Determina si las cookies deben usar el flag `secure` basado en:
 * 1. Si hay una variable de entorno COOKIE_SECURE explícita
 * 2. Si la request viene de HTTPS
 * 3. Si NODE_ENV es production (fallback)
 */
export function getCookieSecure(req?: NextRequest | Request): boolean {
  // Si hay una variable de entorno explícita, usarla
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === "true";
  }

  // Si tenemos acceso a la request, verificar si viene de HTTPS
  if (req) {
    const url = req instanceof Request ? new URL(req.url) : req.nextUrl;
    if (url.protocol === "https:") {
      return true;
    }
    // También verificar headers comunes de proxies (X-Forwarded-Proto)
    // Ambos Request y NextRequest tienen headers
    const proto = req.headers.get("x-forwarded-proto");
    if (proto === "https") {
      return true;
    }
  }

  // Fallback: solo usar secure en producción si realmente hay HTTPS
  // Por defecto, si no hay HTTPS, no usar secure (para que funcione con HTTP)
  return false;
}

/**
 * Opciones estándar para cookies de autenticación
 */
export function getAuthCookieOptions(req?: NextRequest | Request) {
  return {
    httpOnly: true,
    secure: getCookieSecure(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  };
}

