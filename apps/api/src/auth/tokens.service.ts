import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_AUDIENCE } from '@kodecupid/shared';
import { AppConfigService } from '../config/app-config.module';
import { ErrorCode, errors } from '../common/errors';
import { randomToken, sha256 } from '../common/security';
import { parseDurationToMs } from '../common/duration';

export { parseDurationToMs };

export interface AccessTokenPayload {
  sub: string;
  aud: string;
  typ: 'access';
}

interface RefreshParts {
  sessionId: string;
  secret: string;
}

/**
 * Signs short-lived access tokens and produces opaque, restartable refresh
 * tokens. Refresh values are `sessionId.secret`; only the hash of `secret` is
 * persisted, so a database leak cannot be replayed.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signMemberAccess(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, typ: 'access' } satisfies Omit<AccessTokenPayload, 'aud'>,
      {
        secret: this.config.env.JWT_ACCESS_SECRET,
        expiresIn: this.accessExpiry,
        audience: JWT_AUDIENCE.member,
      },
    );
  }

  signAdminAccess(adminId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, typ: 'access' } satisfies Omit<AccessTokenPayload, 'aud'>,
      {
        secret: this.config.env.JWT_ACCESS_SECRET,
        expiresIn: this.accessExpiry,
        audience: JWT_AUDIENCE.admin,
      },
    );
  }

  async verifyMemberAccess(token: string): Promise<AccessTokenPayload> {
    return this.verify(token, JWT_AUDIENCE.member);
  }

  async verifyAdminAccess(token: string): Promise<AccessTokenPayload> {
    return this.verify(token, JWT_AUDIENCE.admin);
  }

  /**
   * `jsonwebtoken` types its `expiresIn` as a template-literal duration; the
   * value is validated by the environment schema (`15m`, `900s`, …).
   */
  private get accessExpiry(): number {
    return this.config.env.JWT_ACCESS_TTL as unknown as number;
  }

  private async verify(token: string, audience: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.env.JWT_ACCESS_SECRET,
        audience,
      });
      if (payload.typ !== 'access' || !payload.sub) {
        throw new Error('wrong token type');
      }
      return payload;
    } catch {
      throw errors.unauthenticated('Your session has expired. Please sign in again.');
    }
  }

  /** Builds the opaque refresh value plus the hash to persist. */
  newRefreshSecret(): { secret: string; hash: string } {
    const secret = randomToken(32);
    return { secret, hash: this.hashRefresh(secret) };
  }

  hashRefresh(secret: string): string {
    return sha256(secret, this.config.env.JWT_REFRESH_SECRET);
  }

  encodeRefresh(sessionId: string, secret: string): string {
    return `${sessionId}.${secret}`;
  }

  decodeRefresh(raw: string | undefined): RefreshParts | null {
    if (!raw) return null;
    const [sessionId, secret] = raw.split('.');
    if (!sessionId || !secret || secret.length < 20) return null;
    return { sessionId, secret };
  }

  get refreshTtlMs(): number {
    return this.config.env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  get accessTtlMs(): number {
    return parseDurationToMs(this.config.env.JWT_ACCESS_TTL, 15 * 60 * 1000);
  }

  refreshExpiryDate(): Date {
    return new Date(Date.now() + this.refreshTtlMs);
  }

  sessionExpired(): never {
    throw errors.unauthenticated('Your session has expired. Please sign in again.');
  }

  refreshRace(): never {
    throw errors.unauthenticated('Please sign in again.', { refreshRace: true });
  }

  invalidSession(): never {
    throw errors.unauthenticated('Please sign in again.');
  }

  static readonly codes = ErrorCode;
}
