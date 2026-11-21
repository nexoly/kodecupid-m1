import { Injectable, Logger } from '@nestjs/common';
import {
  REFRESH_REUSE_GRACE_MS,
  permissionsFor,
  type AdminSession,
  type AdminSummary,
  type AdminLoginInput,
  type AdminRole,
  type AcceptInviteInput,
} from '@kodecupid/shared';
import type { AdminUser } from '../prisma/generated';
import { AppConfigService } from '../config/app-config.module';
import { ErrorCode, errors } from '../common/errors';
import { RateLimiterService } from '../common/rate-limiter.service';
import { randomToken, safeEqual, sha256 } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../auth/tokens.service';
import type { RequestMeta } from '../auth/auth.service';
import { AuditService } from './audit.service';
import { hashPassword, verifyPassword } from './passwords';

export interface AdminAuthResult {
  accessToken: string;
  refreshToken: string;
  session: AdminSession;
}

export function toAdminSummary(admin: AdminUser): AdminSummary {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminRole,
    status: admin.status as 'ACTIVE' | 'DISABLED',
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger('AdminAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tokens: TokensService,
    private readonly limiter: RateLimiterService,
    private readonly audit: AuditService,
  ) {}

  async login(input: AdminLoginInput, meta: RequestMeta): Promise<AdminAuthResult> {
    this.limiter.consume(`admin-login:email:${input.email}`, 5, 15 * 60 * 1000);
    if (meta.ip) {
      this.limiter.consume(`admin-login:ip:${meta.ip}`, 20, 15 * 60 * 1000);
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    const invalid = errors.unauthenticated('Email or password is incorrect');

    if (!admin) {
      await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$invalid$invalid', input.password);
      throw invalid;
    }

    if (admin.status === 'DISABLED') {
      throw errors.forbidden(ErrorCode.PERMISSION_DENIED, 'This admin account is disabled.');
    }

    const passwordMatches = await verifyPassword(admin.passwordHash, input.password);
    if (!passwordMatches) {
      await this.audit.log({
        adminId: admin.id,
        action: 'admin.login.failed',
        targetType: 'admin',
        targetId: admin.id,
        ip: meta.ip,
      });
      throw invalid;
    }

    // Only failed attempts should count towards the lockout: a successful
    // sign-in clears this account's counter (the per-IP limit still applies).
    this.limiter.reset(`admin-login:email:${input.email}`);

    const { secret, hash } = this.tokens.newRefreshSecret();
    const session = await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash: hash,
        expiresAt: this.tokens.refreshExpiryDate(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      adminId: admin.id,
      action: 'admin.login',
      targetType: 'admin',
      targetId: admin.id,
      ip: meta.ip,
    });

    const accessToken = await this.tokens.signAdminAccess(admin.id);
    return {
      accessToken,
      refreshToken: this.tokens.encodeRefresh(session.id, secret),
      session: this.toSession(admin),
    };
  }

  async refresh(rawRefresh: string | undefined, meta: RequestMeta): Promise<AdminAuthResult> {
    const parts = this.tokens.decodeRefresh(rawRefresh);
    if (!parts) this.tokens.invalidSession();

    const session = await this.prisma.adminSession.findUnique({ where: { id: parts!.sessionId } });
    if (!session) this.tokens.invalidSession();

    if (session!.revokedAt) {
      // Concurrent refresh from two tabs: refuse quietly, not a theft signal.
      if (
        session!.replacedById &&
        Date.now() - session!.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS
      ) {
        if (safeEqual(this.tokens.hashRefresh(parts!.secret), session!.tokenHash)) {
          this.tokens.refreshRace();
        }
        this.tokens.invalidSession();
      }
      await this.prisma.adminSession.updateMany({
        where: { adminId: session!.adminId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Admin refresh token reuse detected for ${session!.adminId}`);
      this.tokens.invalidSession();
    }

    if (session!.expiresAt.getTime() < Date.now()) this.tokens.sessionExpired();
    if (!safeEqual(this.tokens.hashRefresh(parts!.secret), session!.tokenHash)) {
      this.tokens.invalidSession();
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: session!.adminId } });
    if (!admin || admin.status === 'DISABLED') this.tokens.invalidSession();

    // Claim the old session and create its replacement atomically, as in
    // AuthService.rotate: concurrent refreshes of one token yield one session.
    const { secret, hash } = this.tokens.newRefreshSecret();
    const replacement = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.adminSession.updateMany({
        where: { id: session!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      const next = await tx.adminSession.create({
        data: {
          adminId: admin!.id,
          tokenHash: hash,
          expiresAt: this.tokens.refreshExpiryDate(),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.adminSession.update({
        where: { id: session!.id },
        data: { replacedById: next.id },
      });
      return next;
    });

    if (!replacement) {
      // Lost to a concurrent refresh (recoverable), or revoked by a logout.
      const previous = await this.prisma.adminSession.findUnique({ where: { id: session!.id } });
      if (
        previous?.replacedById &&
        previous.revokedAt &&
        Date.now() - previous.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS
      ) {
        this.tokens.refreshRace();
      }
      this.tokens.invalidSession();
    }

    const accessToken = await this.tokens.signAdminAccess(admin!.id);
    return {
      accessToken,
      refreshToken: this.tokens.encodeRefresh(replacement.id, secret),
      session: this.toSession(admin!),
    };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    const parts = this.tokens.decodeRefresh(rawRefresh);
    if (!parts) return;
    await this.prisma.adminSession.updateMany({
      where: { id: parts.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async acceptInvitation(input: AcceptInviteInput): Promise<{ email: string; role: AdminRole }> {
    const tokenHash = this.hashInviteToken(input.token);
    const invitation = await this.prisma.adminInvitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.status !== 'PENDING') {
      throw errors.validation('That invitation is no longer valid', {
        code: ErrorCode.INVITATION_INVALID,
      });
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.adminInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw errors.validation('That invitation has expired. Ask a Super Admin for a new one.', {
        code: ErrorCode.INVITATION_INVALID,
      });
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { email: invitation.email },
    });
    if (existing) {
      throw errors.conflict(
        ErrorCode.INVITATION_INVALID,
        'An admin account already exists for this email. Ask a Super Admin to change its role.',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const admin = await this.prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email: invitation.email,
          name: input.name,
          passwordHash,
          role: invitation.role,
          createdById: invitation.invitedById,
        },
      });
      await tx.adminInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      return created;
    });

    await this.audit.log({
      adminId: admin.id,
      action: 'admin.invitation.accepted',
      targetType: 'admin',
      targetId: admin.id,
      metadata: { email: admin.email, role: admin.role },
    });

    return { email: admin.email, role: admin.role as AdminRole };
  }

  hashInviteToken(token: string): string {
    return sha256(token.trim(), this.config.env.JWT_REFRESH_SECRET);
  }

  createInviteToken(): { token: string; hash: string } {
    const token = randomToken(24);
    return { token, hash: this.hashInviteToken(token) };
  }

  toSession(admin: AdminUser): AdminSession {
    return {
      admin: toAdminSummary(admin),
      permissions: [...permissionsFor(admin.role as AdminRole)],
    };
  }
}
