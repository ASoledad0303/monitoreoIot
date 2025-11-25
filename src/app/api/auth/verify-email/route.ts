import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';

const Schema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    const { email, code } = parsed.data;

    const u = await query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const user = u.rows[0];
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const tok = await query<{ id: number }>(
      `SELECT id FROM user_tokens
       WHERE user_id = $1 AND type = 'verify' AND code = $2 AND used = false AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id, code]
    );
    const t = tok.rows[0];
    if (!t) return NextResponse.json({ error: 'Código inválido o vencido' }, { status: 400 });

    await query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
    await query('UPDATE user_tokens SET used = true WHERE id = $1', [t.id]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}