/**
 * Helper functions para trabajar con roles desde la base de datos
 */

import { query } from "./db";
import { ROLES } from "./config";

export interface Role {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Obtiene el nombre del rol desde el role_id
 */
export async function getRoleName(roleId: number): Promise<string | null> {
  const result = await query<{ name: string }>(
    "SELECT name FROM roles WHERE id = $1",
    [roleId]
  );
  return result.rows[0]?.name || null;
}

/**
 * Obtiene el role_id desde el nombre del rol
 */
export async function getRoleId(roleName: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    "SELECT id FROM roles WHERE name = $1",
    [roleName]
  );
  return result.rows[0]?.id || null;
}

/**
 * Obtiene todos los roles disponibles
 */
export async function getAllRoles(): Promise<Role[]> {
  const result = await query<Role>(
    "SELECT id, name, description, created_at, updated_at FROM roles ORDER BY id"
  );
  return result.rows;
}

/**
 * Obtiene el role_id por defecto (user)
 */
export async function getDefaultRoleId(): Promise<number> {
  const roleId = await getRoleId(ROLES.USER);
  if (!roleId) {
    throw new Error("Rol 'user' no encontrado en la base de datos");
  }
  return roleId;
}

/**
 * Obtiene el role_id de super_admin
 */
export async function getSuperAdminRoleId(): Promise<number | null> {
  return await getRoleId(ROLES.SUPER_ADMIN);
}

/**
 * Obtiene el role_id de admin
 */
export async function getAdminRoleId(): Promise<number | null> {
  return await getRoleId(ROLES.ADMIN);
}

