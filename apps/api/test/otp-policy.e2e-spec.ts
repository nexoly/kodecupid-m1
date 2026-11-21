import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/app-config';
import { OtpService } from '../src/auth/otp.service';
import type { SmsProvider } from '../src/auth/sms/sms.provider';

const SECRETS = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

const TEST_NUMBER = '+14155550101';
const REAL_NUMBER = '+14045550199';

function serviceFor(overrides: Record<string, string>) {
  const env = loadEnv({ ...SECRETS, ...overrides } as NodeJS.ProcessEnv);
  const sms: SmsProvider & { sent: string[] } = {
    name: 'fake',
    codeSource: 'local',
    sent: [],
    async sendOtp(phone: string) {
      this.sent.push(phone);
    },
  };
  const prisma = {
    otpChallenge: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'challenge-1' }),
    },
  };
  const limiter = { consume: vi.fn() };
  const service = new OtpService(
    prisma as never,
    { env } as never,
    limiter as never,
    sms,
  );
  return { service, sms };
}

describe('OTP debug-code policy', () => {
  it('accepts the debug code for any number in development', () => {
    const { service } = serviceFor({ NODE_ENV: 'development' });
    expect(service.debugCodeAllowedFor(REAL_NUMBER)).toBe(true);
  });

  it('on staging, accepts the debug code only for allow-listed test numbers', () => {
    const { service } = serviceFor({
      NODE_ENV: 'staging',
      OTP_ALLOW_DEBUG_CODE: 'true',
      OTP_DEBUG_PHONES: `${TEST_NUMBER}, +14155550102`,
    });
    expect(service.debugCodeAllowedFor(TEST_NUMBER)).toBe(true);
    expect(service.debugCodeAllowedFor(REAL_NUMBER)).toBe(false);
  });

  it('on staging with no allow-list, the debug code works for nobody', () => {
    const { service } = serviceFor({ NODE_ENV: 'staging', OTP_ALLOW_DEBUG_CODE: 'true' });
    expect(service.debugCodeAllowedFor(TEST_NUMBER)).toBe(false);
  });

  it('never returns the debug code in the API response on staging', async () => {
    const { service, sms } = serviceFor({
      NODE_ENV: 'staging',
      OTP_ALLOW_DEBUG_CODE: 'true',
      OTP_DEBUG_PHONES: TEST_NUMBER,
    });
    const testResult = await service.issue({ phoneE164: TEST_NUMBER, ip: null });
    const realResult = await service.issue({ phoneE164: REAL_NUMBER, ip: null });

    expect(testResult.debugCode).toBeUndefined();
    expect(realResult.debugCode).toBeUndefined();
    // Real numbers get a real SMS; fictional test numbers are not texted.
    expect(sms.sent).toEqual([REAL_NUMBER]);
  });
});

describe('environment guardrails', () => {
  it('refuses to boot production with the debug code enabled', () => {
    expect(() =>
      loadEnv({
        ...SECRETS,
        NODE_ENV: 'production',
        OTP_ALLOW_DEBUG_CODE: 'true',
      } as NodeJS.ProcessEnv),
    ).toThrow(/debug OTP/);
  });

  it('refuses to boot production without a real SMS provider', () => {
    expect(() =>
      loadEnv({
        ...SECRETS,
        NODE_ENV: 'production',
        OTP_ALLOW_DEBUG_CODE: 'false',
        SMS_PROVIDER: 'console',
      } as NodeJS.ProcessEnv),
    ).toThrow(/SMS_PROVIDER/);
  });

  it('accepts Twilio Verify without a sender number', () => {
    const env = loadEnv({
      ...SECRETS,
      NODE_ENV: 'production',
      OTP_ALLOW_DEBUG_CODE: 'false',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_VERIFY_SERVICE_SID: 'VA_test',
    } as NodeJS.ProcessEnv);
    expect(env.TWILIO_VERIFY_SERVICE_SID).toBe('VA_test');
  });
});

describe('OTP expiry (5 minutes)', () => {
  function statefulService() {
    const env = loadEnv({ ...SECRETS, NODE_ENV: 'staging', OTP_ALLOW_DEBUG_CODE: 'false' } as NodeJS.ProcessEnv);
    const rows = new Map<string, Record<string, unknown>>();
    let sent = '';
    const prisma = {
      otpChallenge: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const row = where.id ? rows.get(where.id as string) : undefined;
          if (!row) return { count: 0 };
          if ('consumedAt' in where && row.consumedAt) return { count: 0 };
          const lt = (where.attempts as { lt?: number } | undefined)?.lt;
          if (lt !== undefined && (row.attempts as number) >= lt) return { count: 0 };
          if ((data.attempts as { increment?: number } | undefined)?.increment) {
            row.attempts = (row.attempts as number) + 1;
          }
          if (data.consumedAt) row.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `c${rows.size + 1}`, attempts: 0, consumedAt: null, ...data };
          rows.set(row.id, row);
          return row;
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      },
    };
    const sms: SmsProvider = {
      name: 'fake',
      codeSource: 'local',
      async sendOtp(_phone: string, code: string) {
        sent = code;
      },
    };
    const service = new OtpService(prisma as never, { env } as never, { consume: vi.fn() } as never, sms);
    return { service, code: () => sent, rows };
  }

  it('issues codes that expire exactly 5 minutes later', async () => {
    const { service } = statefulService();
    const before = Date.now();
    const result = await service.issue({ phoneE164: REAL_NUMBER, ip: null });
    const ttl = new Date(result.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(5 * 60_000 - 50);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 1_000);
  });

  it('accepts a code just before expiry and rejects it just after', async () => {
    vi.useFakeTimers();
    try {
      const fresh = statefulService();
      vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
      const first = await fresh.service.issue({ phoneE164: REAL_NUMBER, ip: null });
      vi.setSystemTime(new Date('2026-11-21T10:04:59Z'));
      await expect(
        fresh.service.verify({ challengeId: first.challengeId, code: fresh.code() }),
      ).resolves.toEqual({ phoneE164: REAL_NUMBER });

      const late = statefulService();
      vi.setSystemTime(new Date('2026-11-21T11:00:00Z'));
      const second = await late.service.issue({ phoneE164: REAL_NUMBER, ip: null });
      vi.setSystemTime(new Date('2026-11-21T11:05:01Z'));
      await expect(
        late.service.verify({ challengeId: second.challengeId, code: late.code() }),
      ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
    } finally {
      vi.useRealTimers();
    }
  });
});
