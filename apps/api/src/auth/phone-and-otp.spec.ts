import { countryOf, maskPhone, normalizePhone, otpRequestSchema } from '@kodecupid/shared';
import { hmacSha256, randomNumericCode, safeEqual } from '../common/security';

describe('phone validation (E.164)', () => {
  it('accepts a full E.164 number without a country hint', () => {
    const result = normalizePhone('+14045550123');
    expect(result).toMatchObject({ ok: true, e164: '+14045550123', iso2: 'US' });
  });

  it('normalises a national number using the selected country', () => {
    const result = normalizePhone('01711-000001', 'BD');
    expect(result).toMatchObject({ ok: true, e164: '+8801711000001', iso2: 'BD' });
  });

  it('strips spaces, dashes and brackets', () => {
    expect(normalizePhone('+1 (404) 555-0123')).toMatchObject({ ok: true, e164: '+14045550123' });
  });

  it.each(['', '12', '+1404', 'not-a-number', '+999123456789', '+1404555012345678'])(
    'rejects %p',
    (raw) => {
      expect(normalizePhone(raw).ok).toBe(false);
    },
  );

  it('requires a country unless the number starts with +', () => {
    expect(otpRequestSchema.safeParse({ phone: '+14045550123' }).success).toBe(true);
    expect(otpRequestSchema.safeParse({ phone: '4045550123' }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ phone: '4045550123', countryCode: 'us' }).success).toBe(true);
  });

  it('derives the country and masks numbers for moderators', () => {
    expect(countryOf('+8801711000001')).toBe('BD');
    const masked = maskPhone('+14045550123');
    expect(masked).not.toContain('4045550');
    expect(masked.endsWith('23')).toBe(true);
  });
});

describe('OTP hashing', () => {
  const key = 'k'.repeat(48);

  it('generates 6-digit numeric codes', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it('stores a keyed hash that never contains the code', () => {
    const hash = hmacSha256('otp:+14045550123:123456', key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('123456');
  });

  it('binds the hash to the phone number and the server key', () => {
    const base = hmacSha256('otp:+14045550123:123456', key);
    expect(hmacSha256('otp:+14045550124:123456', key)).not.toBe(base);
    expect(hmacSha256('otp:+14045550123:123456', 'x'.repeat(48))).not.toBe(base);
    expect(hmacSha256('otp:+14045550123:123456', key)).toBe(base);
  });

  it('compares hashes in constant time and rejects length mismatches', () => {
    const hash = hmacSha256('otp:+1:1', key);
    expect(safeEqual(hash, hash)).toBe(true);
    expect(safeEqual(hash, hash.slice(1))).toBe(false);
    expect(safeEqual(hash, hash.replace(/.$/, hash.endsWith('0') ? '1' : '0'))).toBe(false);
  });
});
