import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { ROLES } from '@/lib/config';

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

    // Verificar si existe algún administrador
    const adminCheck = await query<{ count: string | number }>(
      'SELECT COUNT(*)::int as count FROM users WHERE role = $1',
      [ROLES.ADMIN]
    );
    const hasAdmin = Number(adminCheck.rows[0]?.count || 0) > 0;

    // Si no hay administradores, el primer usuario será admin
    const role = hasAdmin ? ROLES.USER : ROLES.ADMIN;

    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (name, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, email, hash, role]
    );

    return NextResponse.json({ 
      ok: true, 
      isAdmin: !hasAdmin,
      message: !hasAdmin 
        ? 'Cuenta creada como administrador (primer usuario del sistema)' 
        : 'Cuenta creada exitosamente'
    });
  } catch (e) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}