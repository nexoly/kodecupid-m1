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
