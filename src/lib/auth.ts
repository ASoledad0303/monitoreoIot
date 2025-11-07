import { verifyToken } from "./jwt";
import { UserRole, ROLES } from "./config";

export type { UserRole };
export { ROLES };

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
 * Verifica si el usuario tiene el rol de super administrador
 */
export function isSuperAdmin(token: string | null | undefined): boolean {
  return hasRole(token, ROLES.SUPER_ADMIN);
}

/**
 * Verifica si el usuario tiene el rol de administrador (incluye super_admin)
 */
export function isAdmin(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = verifyToken<UserPayload>(token);
  return payload?.role === ROLES.ADMIN || payload?.role === ROLES.SUPER_ADMIN;
}

/**
 * Verifica si el usuario tiene el rol de administrador (solo admin, no super_admin)
 */
export function isAdminOnly(token: string | null | undefined): boolean {
  return hasRole(token, ROLES.ADMIN);
}

/**
 * Verifica si el usuario tiene el rol de usuario regular
 */
export function isUser(token: string | null | undefined): boolean {
  return hasRole(token, ROLES.USER);
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

