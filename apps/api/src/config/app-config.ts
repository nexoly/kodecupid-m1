import { z } from 'zod';

/**
 * Environment contract. The API refuses to boot with an invalid or incomplete
 * environment so misconfiguration is caught at deploy time, not at first request.
 */

const bool = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return fallback;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

const envSchema = z
  .object({
    // `staging` is a real deployment target: it behaves like production for
    // cookies, but it is explicitly allowed to use the debug OTP so the client
    // can test registration without SMS credits. Only `production` forbids it.
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('api/v1'),
    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    /** Direct (unpooled) URL for migrations/seed; the API never uses it. */
    DATABASE_URL_UNPOOLED: optionalString,

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    COOKIE_SECURE: bool(false),

    SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
    SMS_SENDER_NAME: z.string().default('KodeCupid'),
    OTP_DEBUG_CODE: z.string().regex(/^\d{6}$/).default('246810'),
    OTP_ALLOW_DEBUG_CODE: bool(true),
    /**
     * Outside development/test the debug code is accepted ONLY for these
     * numbers (comma-separated E.164), e.g. the seeded sample members. Every
     * other number must pass a real SMS code. Empty = debug code works nowhere.
     */
    OTP_DEBUG_PHONES: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((phone) => phone.trim())
          .filter(Boolean),
      ),
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_FROM_NUMBER: optionalString,
    TWILIO_VERIFY_SERVICE_SID: optionalString,

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('storage'),
    STORAGE_PUBLIC_BASE_URL: optionalString,
    S3_ENDPOINT: optionalString,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_PUBLIC_BASE_URL: optionalString,

    TERMS_VERSION: z.string().default('1.0'),
    GUIDELINES_VERSION: z.string().default('1.0'),
    SAFETY_TIPS_VERSION: z.string().default('1.0'),
    PRIVACY_VERSION: z.string().default('1.0'),

    SEED_ADMIN_EMAIL: z.string().default('admin@kodecupid.test'),
    SEED_ADMIN_PASSWORD: z.string().default('ChangeMe!Admin1'),
    SEED_MODERATOR_EMAIL: z.string().default('moderator@kodecupid.test'),
    SEED_MODERATOR_PASSWORD: z.string().default('ChangeMe!Mod1'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.OTP_ALLOW_DEBUG_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_ALLOW_DEBUG_CODE'],
        message: 'The debug OTP code must be disabled in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.SMS_PROVIDER !== 'twilio') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'Production must send real SMS (SMS_PROVIDER=twilio)',
      });
    }
    if (value.SMS_PROVIDER === 'twilio') {
      // Twilio Verify needs a service SID; raw Twilio Messages needs a sender.
      const required: (keyof typeof value)[] = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        value.TWILIO_VERIFY_SERVICE_SID ? 'TWILIO_VERIFY_SERVICE_SID' : 'TWILIO_FROM_NUMBER',
      ];
      for (const key of required) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${String(key)} is required when SMS_PROVIDER=twilio`,
          });
        }
      }
    }
    if (value.STORAGE_DRIVER === 's3' && !value.S3_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when STORAGE_DRIVER=s3',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export function legalVersionsOf(env: AppEnv) {
  return {
    terms: env.TERMS_VERSION,
    guidelines: env.GUIDELINES_VERSION,
    safetyTips: env.SAFETY_TIPS_VERSION,
    privacy: env.PRIVACY_VERSION,
  };
}
