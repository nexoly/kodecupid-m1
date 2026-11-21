import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Stable hash for high-entropy values (OTP codes, refresh tokens, invite tokens). */
/** Keyed hash for short secrets (OTP codes): unguessable without the key. */
export function hmacSha256(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function sha256(value: string, pepper = ''): string {
  return createHash('sha256').update(`${value}${pepper}`).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function randomNumericCode(length = 6): string {
  let code = '';
  while (code.length < length) {
    code += randomBytes(1)[0]!.toString().padStart(3, '0');
  }
  return code.slice(0, length);
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
