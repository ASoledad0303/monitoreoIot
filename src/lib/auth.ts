import { verifyToken } from "./jwt";

export type UserRole = "user" | "admin";

export interface UserPayload {
  sub: number; // user id
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Verifica si el token JWT contiene un rol específico
 */
export function hasRole(token: string | null | undefined, role: UserRole): boolean {
  if (!token) return false;
  const payload = verifyToken<UserPayload>(token);
  return payload?.role === role;
}

/**
 * Verifica si el usuario tiene el rol de administrador
 */
export function isAdmin(token: string | null | undefined): boolean {
  return hasRole(token, "admin");
}

/**
 * Verifica si el usuario tiene el rol de usuario regular
 */
export function isUser(token: string | null | undefined): boolean {
  return hasRole(token, "user");
}

/**
 * Obtiene el payload del usuario desde el token
 */
export function getUserFromToken(token: string | null | undefined): UserPayload | null {
  if (!token) return null;
  return verifyToken<UserPayload>(token);
}

/**
 * Verifica si el usuario tiene cualquiera de los roles especificados
 */
export function hasAnyRole(token: string | null | undefined, roles: UserRole[]): boolean {
  if (!token) return false;
  const payload = verifyToken<UserPayload>(token);
  if (!payload) return false;
  return roles.includes(payload.role);
}

