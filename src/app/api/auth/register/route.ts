import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSuperAdminRoleId, getDefaultRoleId } from '@/lib/roles';
import { setAuditUser } from '@/lib/audit';

const RegisterSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rows.length > 0) {
      return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 });
    }

    // Verificar si existe algún super_admin
    const superAdminRoleId = await getSuperAdminRoleId();
    if (!superAdminRoleId) {
      throw new Error("Rol super_admin no encontrado en la base de datos");
    }

    const superAdminCheck = await query<{ count: string | number }>(
      'SELECT COUNT(*)::int as count FROM users WHERE role_id = $1',
      [superAdminRoleId]
    );
    const hasSuperAdmin = Number(superAdminCheck.rows[0]?.count || 0) > 0;

    // Si no hay super_admin, el primer usuario será super_admin
    const roleId = hasSuperAdmin ? await getDefaultRoleId() : superAdminRoleId;

    // Para registro, no hay usuario autenticado, así que no establecemos user_id
    // El trigger registrará changed_by como NULL (sistema)
    await setAuditUser(null); // NULL indicará que es creación del sistema

    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (name, email, password_hash, role_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, email, hash, roleId]
    );

    return NextResponse.json({ 
      ok: true, 
      isSuperAdmin: !hasSuperAdmin,
      message: !hasSuperAdmin 
        ? 'Cuenta creada como super administrador (primer usuario del sistema)' 
        : 'Cuenta creada exitosamente'
    });
  } catch {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}