/**
 * Helper functions para el sistema de auditoría
 * 
 * Estas funciones permiten establecer el contexto de auditoría
 * antes de realizar operaciones en la base de datos.
 */

import { query } from './db';
import { NextRequest } from 'next/server';

/**
 * Establece el usuario de auditoría en la sesión actual de PostgreSQL
 * Debe ser llamado antes de realizar operaciones que se desean auditar
 * 
 * @param userId - ID del usuario que realiza la operación (0 o negativo = NULL, sistema)
 */
export async function setAuditUser(userId: number | null): Promise<void> {
  // Si userId es 0 o negativo, no establecer (será NULL = sistema)
  if (userId === null || userId <= 0) {
    // No establecer variable de sesión, el trigger usará NULL
    return;
  }
  await query('SELECT set_audit_user($1)', [userId]);
}

/**
 * Establece metadatos adicionales de auditoría (IP, user agent)
 * 
 * @param ipAddress - Dirección IP del cliente
 * @param userAgent - User agent del cliente
 */
export async function setAuditMetadata(
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  if (ipAddress || userAgent) {
    await query('SELECT set_audit_metadata($1, $2)', [
      ipAddress || null,
      userAgent || null,
    ]);
  }
}

/**
 * Helper para establecer el contexto de auditoría completo desde una request
 * 
 * @param request - Request de Next.js
 * @param userId - ID del usuario autenticado
 */
export async function setupAuditContext(
  request: NextRequest,
  userId: number
): Promise<void> {
  // Obtener IP del cliente
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    null;

  // Obtener user agent
  const userAgent = request.headers.get('user-agent') || null;

  // Establecer contexto de auditoría
  await setAuditUser(userId);
  await setAuditMetadata(ipAddress, userAgent);
}

/**
 * Deshabilita temporalmente la auditoría en una tabla
 * Útil para operaciones masivas de mantenimiento
 * 
 * @param tableName - Nombre de la tabla
 */
export async function disableAuditOnTable(tableName: string): Promise<void> {
  await query('SELECT toggle_audit_on_table($1, false)', [tableName]);
}

/**
 * Habilita la auditoría en una tabla
 * 
 * @param tableName - Nombre de la tabla
 */
export async function enableAuditOnTable(tableName: string): Promise<void> {
  await query('SELECT toggle_audit_on_table($1, true)', [tableName]);
}

