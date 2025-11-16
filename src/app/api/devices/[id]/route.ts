import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";
import { setupAuditContext } from "@/lib/audit";

const UpdateDeviceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  description: z.string().optional(),
  location: z.string().max(200).optional(),
  is_active: z.boolean().optional(),
});

/**
 * Actualiza un dispositivo (solo admin)
 * PUT /api/devices/[id]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    if (!COMPANY_CONFIG.ENABLED) {
      return NextResponse.json(
        { error: "La funcionalidad de companies está deshabilitada" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const deviceId = parseInt(id);

    if (isNaN(deviceId)) {
      return NextResponse.json(
        { error: "ID de dispositivo inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = UpdateDeviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Verificar que el dispositivo existe
    const deviceCheck = await query<{ id: number; company_id: number }>(
      "SELECT id, company_id FROM devices WHERE id = $1",
      [deviceId]
    );

    if (deviceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Dispositivo no encontrado" },
        { status: 404 }
      );
    }

    const companyId = deviceCheck.rows[0].company_id;

    // Verificar que el código no esté duplicado si se proporciona
    if (parsed.data.code) {
      const existing = await query<{ id: number }>(
        "SELECT id FROM devices WHERE company_id = $1 AND code = $2 AND id != $3",
        [companyId, parsed.data.code, deviceId]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "El código de dispositivo ya existe en esta company" },
          { status: 400 }
        );
      }
    }

    // Construir query dinámico
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (parsed.data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(parsed.data.name);
    }
    if (parsed.data.code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      values.push(parsed.data.code || null);
    }
    if (parsed.data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(parsed.data.description || null);
    }
    if (parsed.data.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(parsed.data.location || null);
    }
    if (parsed.data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(parsed.data.is_active);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No hay campos para actualizar" },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(deviceId);

    // Obtener usuario actual para auditoría
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    await query(
      `UPDATE devices SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error actualizando device:", e);
    if (e.code === "23505") {
      return NextResponse.json(
        { error: "El código de dispositivo ya existe" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Elimina un dispositivo (solo admin)
 * DELETE /api/devices/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    if (!COMPANY_CONFIG.ENABLED) {
      return NextResponse.json(
        { error: "La funcionalidad de companies está deshabilitada" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const deviceId = parseInt(id);

    if (isNaN(deviceId)) {
      return NextResponse.json(
        { error: "ID de dispositivo inválido" },
        { status: 400 }
      );
    }

    // Verificar que el dispositivo existe
    const deviceCheck = await query<{ id: number }>(
      "SELECT id FROM devices WHERE id = $1",
      [deviceId]
    );

    if (deviceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Dispositivo no encontrado" },
        { status: 404 }
      );
    }

    // Obtener usuario actual para auditoría
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    // Eliminar el dispositivo (los datos históricos se mantienen con device_id NULL)
    await query("DELETE FROM devices WHERE id = $1", [deviceId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando device:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}


