import { Logger } from '@nestjs/common';
import { Twilio } from 'twilio';
import { AppConfigService } from '../../config/app-config.module';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/**
 * Two delivery models are supported:
 *
 *  - `local` codes: the API generates the code, stores only its HMAC and asks
 *    the provider to deliver the text (console, Twilio Messages).
 *  - `external` codes: the provider generates, delivers and checks the code
 *    itself (Twilio Verify). The API never sees the code; it still owns expiry,
 *    attempt counting, rate limiting and reuse prevention via its own challenge.
 */
export interface SmsProvider {
  readonly name: string;
  readonly codeSource: 'local' | 'external';
  /** Deliver a locally generated code (codeSource = local). */
  sendOtp(phoneE164: string, code: string): Promise<void>;
  /** Start a provider-managed verification (codeSource = external). */
  startVerification?(phoneE164: string): Promise<void>;
  /** Check a provider-managed code (codeSource = external). */
  checkVerification?(phoneE164: string, code: string): Promise<boolean>;
}

/** Never log a full phone number: keep the country prefix and last two digits. */
export function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 6) return '***';
  return `${phoneE164.slice(0, 3)}${'*'.repeat(phoneE164.length - 5)}${phoneE164.slice(-2)}`;
}

/**
 * Development provider: prints the code to the API log so the flow can be
 * tested without SMS credits. Refused outside development/test by the config.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  readonly codeSource = 'local' as const;
  private readonly logger = new Logger('SMS');

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phoneE164}: ${code} (console provider — no SMS sent)`);
  }
}

/** Raw SMS through Twilio Messages (used when no Verify service is configured). */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  readonly codeSource = 'local' as const;
  private readonly logger = new Logger('SMS');
  private readonly client: Twilio;

  constructor(private readonly config: AppConfigService) {
    this.client = new Twilio(config.env.TWILIO_ACCOUNT_SID, config.env.TWILIO_AUTH_TOKEN);
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const from = this.config.env.TWILIO_FROM_NUMBER;
    if (!from) {
      throw new Error('TWILIO_FROM_NUMBER is not configured');
    }

    await this.client.messages.create({
      to: phoneE164,
      from,
      body: `${this.config.env.SMS_SENDER_NAME}: your verification code is ${code}. It expires in 5 minutes.`,
    });
    this.logger.log(`OTP sent to ${maskPhone(phoneE164)} via Twilio Messages`);
  }
}

/**
 * Twilio Verify: Twilio generates, sends and checks the code. Recommended for
 * staging and production (handles carrier compliance and sender numbers).
 */
export class TwilioVerifyProvider implements SmsProvider {
  readonly name = 'twilio-verify';
  readonly codeSource = 'external' as const;
  private readonly logger = new Logger('SMS');
  private readonly client: Twilio;
  private readonly serviceSid: string;

  constructor(config: AppConfigService) {
    this.client = new Twilio(config.env.TWILIO_ACCOUNT_SID, config.env.TWILIO_AUTH_TOKEN);
    this.serviceSid = config.env.TWILIO_VERIFY_SERVICE_SID as string;
  }

  async sendOtp(): Promise<void> {
    throw new Error('Twilio Verify generates its own codes; use startVerification()');
  }

  async startVerification(phoneE164: string): Promise<void> {
    await this.client.verify.v2
      .services(this.serviceSid)
      .verifications.create({ to: phoneE164, channel: 'sms' });
    this.logger.log(`Verification started for ${maskPhone(phoneE164)} via Twilio Verify`);
  }

  async checkVerification(phoneE164: string, code: string): Promise<boolean> {
    try {
      const check = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: phoneE164, code });
      return check.status === 'approved';
    } catch (error) {
      // Twilio answers 404 once a verification is approved, expired or used up.
      const status = (error as { status?: number }).status;
      if (status === 404) return false;
      throw error;
    }
  }
}

export function createSmsProvider(config: AppConfigService): SmsProvider {
  if (config.env.SMS_PROVIDER !== 'twilio') {
    return new ConsoleSmsProvider();
  }
  return config.env.TWILIO_VERIFY_SERVICE_SID
    ? new TwilioVerifyProvider(config)
    : new TwilioSmsProvider(config);
}
