import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';

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

    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (name, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [name, email, hash]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}