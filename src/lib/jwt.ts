import { sign, verify, type Secret, type SignOptions } from 'jsonwebtoken';

const DEFAULT_EXP = 60 * 60 * 24 * 7; // 7 días en segundos

export function signToken(payload: object, expiresIn: number = DEFAULT_EXP) {
  const secret: Secret = process.env.JWT_SECRET || 'change_this_secret';
  const options: SignOptions = { expiresIn };
  return sign(payload, secret, options);
}

export function verifyToken<T = any>(token: string): T | null {
  try {
    const secret: Secret = process.env.JWT_SECRET || 'change_this_secret';
    return verify(token, secret) as T;
  } catch {
    return null;
  }
}