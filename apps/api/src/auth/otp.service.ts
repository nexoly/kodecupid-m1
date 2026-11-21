import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  OTP_MAX_ATTEMPTS,
  OTP_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  type OtpRequestResult,
} from '@kodecupid/shared';
import { AppConfigService } from '../config/app-config.module';
import { ErrorCode, appError, errors } from '../common/errors';
import { RateLimiterService } from '../common/rate-limiter.service';
import { hmacSha256, randomNumericCode, safeEqual } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, maskPhone, type SmsProvider } from './sms/sms.provider';

interface IssueOptions {
  phoneE164: string;
  ip: string | null;
}

interface VerifyOptions {
  challengeId: string;
  code: string;
}

/**
 * Stored in place of a hash when the provider (Twilio Verify) owns the code.
 * It can never equal an HMAC, so a local comparison always fails safely.
 */
const EXTERNAL_CODE_MARKER = 'external:provider-managed';

@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly limiter: RateLimiterService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Development and automated tests only: any number may use the debug code. */
  private get isLocalEnvironment(): boolean {
    const env = this.config.env.NODE_ENV;
    return env === 'development' || env === 'test';
  }

  /**
   * Whether the debug code is accepted for this number. Production: never.
   * Staging: only for explicitly allow-listed test numbers (seeded members), so
   * a real member's account can never be opened with the shared debug code.
   */
  debugCodeAllowedFor(phoneE164: string): boolean {
    if (!this.config.env.OTP_ALLOW_DEBUG_CODE) return false;
    if (this.config.env.NODE_ENV === 'production') return false;
    if (this.isLocalEnvironment) return true;
    return this.config.env.OTP_DEBUG_PHONES.includes(phoneE164);
  }

  /** Creates a challenge, enforces rate limits and delivers the code. */
  async issue({ phoneE164, ip }: IssueOptions): Promise<OtpRequestResult> {
    const now = new Date();
    const windowMs = OTP_REQUEST_WINDOW_MINUTES * 60 * 1000;

    // Per-IP burst protection (in-process is enough for this coarse limit).
    if (ip) {
      this.limiter.consume(`otp:ip:${ip}`, 20, windowMs);
    }

    // Per-phone limit is counted in the database so it survives restarts and
    // holds across multiple API instances: max 3 requests per 15 minutes.
    const windowStart = new Date(now.getTime() - windowMs);
    const recent = await this.prisma.otpChallenge.findMany({
      where: { phoneE164, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    if (recent.length >= OTP_REQUESTS_PER_WINDOW) {
      const oldest = recent[0]!.createdAt.getTime();
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000));
      throw errors.tooManyRequests(
        ErrorCode.RATE_LIMITED,
        `Too many codes requested for this number. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        { retryAfterSeconds },
      );
    }

    if (this.config.env.NODE_ENV !== 'test' && recent.length > 0) {
      const latest = recent[recent.length - 1]!.createdAt.getTime();
      const elapsedMs = now.getTime() - latest;
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw errors.tooManyRequests(
          ErrorCode.OTP_RESEND_TOO_SOON,
          `A code was just sent. You can request another in ${retryAfterSeconds}s.`,
          { retryAfterSeconds },
        );
      }
    }

    const external = this.sms.codeSource === 'external';
    const code = external ? null : randomNumericCode(6);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    // A new code supersedes any older open code for this number.
    await this.prisma.otpChallenge.updateMany({
      where: { phoneE164, consumedAt: null },
      data: { consumedAt: now },
    });

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        phoneE164,
        codeHash: code ? this.hashCode(code, phoneE164) : EXTERNAL_CODE_MARKER,
        expiresAt,
        ip,
      },
    });

    // Allow-listed test numbers on staging skip real delivery (they are fictional).
    const skipDelivery = !this.isLocalEnvironment && this.debugCodeAllowedFor(phoneE164);

    if (!skipDelivery) {
      try {
        if (external) {
          await this.sms.startVerification!(phoneE164);
        } else {
          await this.sms.sendOtp(phoneE164, code!);
        }
      } catch (error) {
        this.logger.error(
          `Could not deliver OTP for ${maskPhone(phoneE164)} via ${this.sms.name}`,
          error instanceof Error ? error.message : String(error),
        );
        throw errors.validation(
          'We could not send the code right now. Please try again in a moment.',
          { provider: this.sms.name },
        );
      }
    }

    const result: OtpRequestResult = {
      challengeId: challenge.id,
      phone: phoneE164,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(
        now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      ).toISOString(),
    };

    // The debug code is echoed back only on a developer machine / in tests.
    // Staging testers receive it privately with their test credentials.
    if (this.isLocalEnvironment && this.debugCodeAllowedFor(phoneE164)) {
      result.debugCode = this.config.env.OTP_DEBUG_CODE;
    }

    return result;
  }

  /** Validates a code and marks the challenge consumed (exactly once). */
  async verify({ challengeId, code }: VerifyOptions): Promise<{ phoneE164: string }> {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });

    if (!challenge || challenge.consumedAt) {
      throw appError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.OTP_INVALID,
        'That code is no longer valid. Request a new one.',
      );
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw appError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.OTP_EXPIRED,
        'That code has expired. Request a new one.',
      );
    }

    // Reserve an attempt atomically before checking, so parallel guesses
    // cannot exceed the 5-attempt budget.
    const reserved = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) {
      throw appError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
        'Too many incorrect codes. Request a new one.',
      );
    }
    const attempts = challenge.attempts + 1;

    const trimmed = code.trim();
    const debugMatches =
      this.debugCodeAllowedFor(challenge.phoneE164) &&
      safeEqual(trimmed, this.config.env.OTP_DEBUG_CODE);

    let matches = debugMatches;
    if (!matches) {
      if (challenge.codeHash === EXTERNAL_CODE_MARKER) {
        matches = await this.checkExternal(challenge.phoneE164, trimmed);
      } else {
        matches = safeEqual(this.hashCode(trimmed, challenge.phoneE164), challenge.codeHash);
      }
    }

    if (!matches) {
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
      throw appError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.OTP_INVALID,
        remaining > 0
          ? `That code is not right. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'Too many incorrect codes. Request a new one.',
        { attemptsRemaining: remaining },
      );
    }

    // Conditional update: only one concurrent request can consume the code.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw appError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.OTP_INVALID,
        'That code is no longer valid. Request a new one.',
      );
    }

    return { phoneE164: challenge.phoneE164 };
  }

  private async checkExternal(phoneE164: string, code: string): Promise<boolean> {
    if (!this.sms.checkVerification) return false;
    try {
      return await this.sms.checkVerification(phoneE164, code);
    } catch (error) {
      this.logger.error(
        `Verification check failed for ${maskPhone(phoneE164)}`,
        error instanceof Error ? error.message : String(error),
      );
      throw errors.validation('We could not check the code right now. Please try again.');
    }
  }

  private hashCode(code: string, phone: string): string {
    return hmacSha256(`otp:${phone}:${code}`, this.config.env.JWT_ACCESS_SECRET);
  }
}
