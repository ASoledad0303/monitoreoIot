import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken } from '@/lib/jwt';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const res = await query<{ id: number; email: string; password_hash: string; name: string }>(
      'SELECT id, email, password_hash, name FROM users WHERE email = $1',
      [email]
    );

    const user = res.rows[0];
    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    const token = signToken({ sub: user.id, email: user.email, name: user.name });
    const resp = NextResponse.json({ ok: true });
    resp.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });
    return resp;
  } catch (e) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}