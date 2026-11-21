import { Injectable, Logger } from '@nestjs/common';
import {
  REFRESH_REUSE_GRACE_MS,
  countryOf,
  normalizePhone,
  type MemberSession,
  type OtpRequestResult,
  type OtpVerifyInput,
  type OtpRequestInput,
} from '@kodecupid/shared';
import { AppConfigService } from '../config/app-config.module';
import { ErrorCode, errors } from '../common/errors';
import { safeEqual } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import type { MemberRecord } from './auth.types';
import { MemberSessionService } from './member-session.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends IssuedTokens {
  created: boolean;
  session: MemberSession;
}

const MEMBER_INCLUDE = {
  legalAcceptances: true,
  profile: true,
  onboarding: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly sessions: MemberSessionService,
  ) {}

  async requestOtp(input: OtpRequestInput, meta: RequestMeta): Promise<OtpRequestResult> {
    const parsed = normalizePhone(input.phone, input.countryCode as never);
    if (!parsed.ok) {
      throw errors.validation('That phone number does not look right', {
        fieldErrors: { phone: parsed.message },
      });
    }

    return this.otp.issue({ phoneE164: parsed.e164, ip: meta.ip });
  }

  async verifyOtp(input: OtpVerifyInput, meta: RequestMeta): Promise<AuthResult> {
    const { phoneE164 } = await this.otp.verify(input);

    let user = await this.prisma.user.findUnique({
      where: { phoneE164 },
      include: MEMBER_INCLUDE,
    });

    let created = false;

    if (!user) {
      const country = countryOf(phoneE164) ?? 'US';
      user = await this.prisma.user.create({
        data: {
          phoneE164,
          phoneCountry: country,
          phoneVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          status: 'PENDING_COMPLIANCE',
          profile: { create: {} },
          preferences: { create: {} },
          onboarding: { create: {} },
        },
        include: MEMBER_INCLUDE,
      });
      created = true;
      this.logger.log(`New member registered (${user.id})`);
    } else {
      if (user.status === 'SUSPENDED') {
        throw errors.forbidden(
          ErrorCode.ACCOUNT_SUSPENDED,
          'This account is suspended. Please contact support.',
        );
      }
      if (user.status === 'DELETED') {
        throw errors.forbidden(
          ErrorCode.ACCOUNT_SUSPENDED,
          'This account was deleted. Please contact support.',
        );
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          ...(user.profile ? {} : { profile: { create: {} } }),
        },
        include: MEMBER_INCLUDE,
      });
    }

    const tokens = await this.issueTokens(user.id, meta);
    return { ...tokens, created, session: this.sessions.build(user) };
  }

  async refresh(rawRefresh: string | undefined, meta: RequestMeta): Promise<AuthResult> {
    const parts = this.tokens.decodeRefresh(rawRefresh);
    if (!parts) {
      this.tokens.invalidSession();
    }

    const session = await this.prisma.session.findUnique({ where: { id: parts!.sessionId } });
    if (!session) {
      this.tokens.invalidSession();
    }

    if (session!.revokedAt) {
      // A token rotated seconds ago is a concurrent-refresh race (two tabs):
      // refuse it, but do not treat it as theft.
      if (
        session!.replacedById &&
        Date.now() - session!.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS
      ) {
        if (safeEqual(this.tokens.hashRefresh(parts!.secret), session!.tokenHash)) {
          this.tokens.refreshRace();
        }
        this.tokens.invalidSession();
      }
      // Token reuse after rotation: assume theft and end every session.
      await this.prisma.session.updateMany({
        where: { userId: session!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected for user ${session!.userId}`);
      this.tokens.invalidSession();
    }

    if (session!.expiresAt.getTime() < Date.now()) {
      this.tokens.sessionExpired();
    }

    if (!safeEqual(this.tokens.hashRefresh(parts!.secret), session!.tokenHash)) {
      this.tokens.invalidSession();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session!.userId },
      include: MEMBER_INCLUDE,
    });

    if (!user || user.status === 'DELETED') {
      this.tokens.invalidSession();
    }
    if (user!.status === 'SUSPENDED') {
      throw errors.forbidden(
        ErrorCode.ACCOUNT_SUSPENDED,
        'This account is suspended. Please contact support.',
      );
    }

    const rotated = await this.rotate(session!.id, user!.id, meta);
    return { ...rotated, created: false, session: this.sessions.build(user as MemberRecord) };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    const parts = this.tokens.decodeRefresh(rawRefresh);
    if (!parts) return;
    await this.prisma.session.updateMany({
      where: { id: parts.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(member: MemberRecord): Promise<MemberSession> {
    return this.sessions.build(member);
  }

  private async issueTokens(userId: string, meta: RequestMeta): Promise<IssuedTokens> {
    const { secret, hash } = this.tokens.newRefreshSecret();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: this.tokens.refreshExpiryDate(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    const accessToken = await this.tokens.signMemberAccess(userId);
    return { accessToken, refreshToken: this.tokens.encodeRefresh(session.id, secret) };
  }

  private async rotate(
    previousSessionId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const { secret, hash } = this.tokens.newRefreshSecret();
    const replacement = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: { id: previousSessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      const next = await tx.session.create({
        data: {
          userId,
          tokenHash: hash,
          expiresAt: this.tokens.refreshExpiryDate(),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.session.update({
        where: { id: previousSessionId },
        data: { replacedById: next.id },
      });
      return next;
    });

    if (!replacement) {
      // Another request may have rotated the already-validated token, or a
      // logout may have revoked it. Only a recent rotation can be recovered.
      const previous = await this.prisma.session.findUnique({ where: { id: previousSessionId } });
      if (
        previous?.replacedById &&
        previous.revokedAt &&
        Date.now() - previous.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS
      ) {
        this.tokens.refreshRace();
      }
      this.tokens.invalidSession();
    }

    const accessToken = await this.tokens.signMemberAccess(userId);
    return { accessToken, refreshToken: this.tokens.encodeRefresh(replacement.id, secret) };
  }
}
