import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const UpdateFacturaSchema = z.object({
  potencia_facturada_kw: z.number().min(0).optional(),
  potencia_media_medida_kw: z.number().min(0).optional(),
  diferencia_kw: z.number().optional(),
});

/**
 * Actualiza una factura existente
 * PUT /api/facturas/[id]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const facturaId = parseInt(id);

    if (isNaN(facturaId)) {
      return NextResponse.json(
        { error: "ID de factura inválido" },
        { status: 400 }
      );
    }

    // Verificar que la factura pertenece al usuario
    const facturaCheck = await query<{ id: number; potencia_facturada_kw: number; potencia_media_medida_kw: number | null }>(
      "SELECT id, potencia_facturada_kw, potencia_media_medida_kw FROM facturas WHERE id = $1 AND user_id = $2",
      [facturaId, user.sub]
    );

    if (facturaCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = UpdateFacturaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const existing = facturaCheck.rows[0];
    const {
      potencia_facturada_kw = existing.potencia_facturada_kw,
      potencia_media_medida_kw = existing.potencia_media_medida_kw,
      diferencia_kw,
    } = parsed.data;

    // Calcular diferencia si no se proporciona
    const diferencia =
      diferencia_kw ??
      (potencia_media_medida_kw !== null
        ? potencia_media_medida_kw - potencia_facturada_kw
        : null);

    await query(
      `UPDATE facturas
       SET potencia_facturada_kw = $1,
           potencia_media_medida_kw = $2,
           diferencia_kw = $3,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [
        potencia_facturada_kw,
        potencia_media_medida_kw,
        diferencia,
        facturaId,
        user.sub,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando factura:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Elimina una factura
 * DELETE /api/facturas/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const facturaId = parseInt(id);

    if (isNaN(facturaId)) {
      return NextResponse.json(
        { error: "ID de factura inválido" },
        { status: 400 }
      );
    }

    const result = await query(
      "DELETE FROM facturas WHERE id = $1 AND user_id = $2",
      [facturaId, user.sub]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando factura:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

