/**
 * Configuración centralizada del sistema
 */

/**
 * Roles disponibles en el sistema
 */
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

/**
 * Valida si un string es un rol válido
 */
export function isValidRole(role: string): role is UserRole {
  return role === ROLES.USER || role === ROLES.ADMIN;
}

/**
 * Lista de todos los roles disponibles
 */
export const ALL_ROLES: UserRole[] = [ROLES.USER, ROLES.ADMIN];

/**
 * Configuración de company
 */
export const COMPANY_CONFIG = {
  // Habilita/deshabilita la funcionalidad multi-company
  ENABLED: process.env.COMPANY_ENABLED === 'true',
  // Nombre de la tabla
  TABLE_NAME: 'companies',
  // Campo de relación en users
  USER_FOREIGN_KEY: 'company_id',
} as const;

/**
 * Interfaz para Company
 */
export interface Company {
  id: number;
  name: string;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Interfaz para crear/actualizar Company
 */
export interface CompanyInput {
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  address?: string;
}

