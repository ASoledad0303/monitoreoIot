import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG, ROLES } from "@/lib/config";
import { setupAuditContext } from "@/lib/audit";

const UpdateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
});

/**
 * Actualiza una company (solo admin)
 * PUT /api/companies/[id]
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
    const companyId = parseInt(id);

    if (isNaN(companyId)) {
      return NextResponse.json(
        { error: "ID de company inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = UpdateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Verificar que la company existe
    const companyCheck = await query<{ id: number }>(
      "SELECT id FROM companies WHERE id = $1",
      [companyId]
    );

    if (companyCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Company no encontrada" },
        { status: 404 }
      );
    }

    // Si es admin (no super_admin), solo puede actualizar su company
    if (user.role === ROLES.ADMIN) {
      const userCompany = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      
      if (userCompany.rows[0]?.company_id !== companyId) {
        return NextResponse.json(
          { error: "Solo puedes actualizar tu propia company" },
          { status: 403 }
        );
      }
    }

    // Verificar que el código no esté duplicado si se proporciona
    if (parsed.data.code) {
      const existing = await query<{ id: number }>(
        "SELECT id FROM companies WHERE code = $1 AND id != $2",
        [parsed.data.code, companyId]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "El código de company ya existe" },
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
    if (parsed.data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(parsed.data.email || null);
    }
    if (parsed.data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(parsed.data.phone || null);
    }
    if (parsed.data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(parsed.data.address || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(companyId);

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    await query(
      `UPDATE companies SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error actualizando company:", e);
    if (e.code === "23505") {
      return NextResponse.json(
        { error: "El código de company ya existe" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Elimina una company (solo admin)
 * DELETE /api/companies/[id]
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
    const companyId = parseInt(id);

    if (isNaN(companyId)) {
      return NextResponse.json(
        { error: "ID de company inválido" },
        { status: 400 }
      );
    }

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Solo super_admin puede eliminar companies
    if (user.role !== ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Solo super administradores pueden eliminar companies" },
        { status: 403 }
      );
    }

    // Verificar que la company existe
    const companyCheck = await query<{ id: number }>(
      "SELECT id FROM companies WHERE id = $1",
      [companyId]
    );

    if (companyCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Company no encontrada" },
        { status: 404 }
      );
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    // Eliminar la company (los users.company_id se pondrán en NULL por ON DELETE SET NULL)
    await query("DELETE FROM companies WHERE id = $1", [companyId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando company:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

