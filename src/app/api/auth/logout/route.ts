import { NextResponse } from 'next/server';
import { getAuthCookieOptions } from '@/lib/cookies';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const resp = NextResponse.json({ ok: true });
  const cookieOptions = getAuthCookieOptions(req);
  resp.cookies.set('auth_token', '', {
    ...cookieOptions,
    maxAge: 0, // Eliminar cookie
  });
  return resp;
}