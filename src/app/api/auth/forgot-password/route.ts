import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { queueEmail, renderResetEmail } from '@/lib/mailer';

const Schema = z.object({ email: z.string().email() });

function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    const { email } = parsed.data;

    const u = await query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const user = u.rows[0];
    if (!user) return NextResponse.json({ ok: true }); // no revelar si existe

    const code = genCode();
    const expiresInMin = 15;
    await query(
      `INSERT INTO user_tokens (user_id, type, code, expires_at)
       VALUES ($1, 'reset', $2, NOW() + INTERVAL '${expiresInMin} minutes')`,
      [user.id, code]
    );

    await queueEmail(email, 'Código para restablecer contraseña', renderResetEmail(code));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}