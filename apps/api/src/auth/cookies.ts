import type { CookieOptions, Response } from 'express';
import { ADMIN_COOKIE, MEMBER_COOKIE } from '@kodecupid/shared';
import { AppConfigService } from '../config/app-config.module';

export type Audience = 'member' | 'admin';

const REFRESH_PATH: Record<Audience, string> = {
  member: '/api/v1/auth',
  admin: '/api/v1/admin/auth',
};

function baseOptions(config: AppConfigService, path: string): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path,
  };
}

/**
 * Auth cookies are httpOnly and same-origin (the web app proxies /api), which
 * keeps them out of reach of XSS and avoids cross-site cookie restrictions.
 */
export function setAuthCookies(
  response: Response,
  options: {
    config: AppConfigService;
    audience: Audience;
    accessToken: string;
    refreshToken: string;
    accessTtlMs: number;
    refreshTtlMs: number;
  },
): void {
  const { config, audience, accessToken, refreshToken, accessTtlMs, refreshTtlMs } = options;
  const names = audience === 'member' ? MEMBER_COOKIE : ADMIN_COOKIE;

  response.cookie(names.access, accessToken, {
    ...baseOptions(config, '/'),
    maxAge: accessTtlMs,
  });
  response.cookie(names.refresh, refreshToken, {
    ...baseOptions(config, REFRESH_PATH[audience]),
    maxAge: refreshTtlMs,
  });
  response.cookie(names.session, '1', {
    ...baseOptions(config, '/'),
    maxAge: refreshTtlMs,
  });
}

export function clearAuthCookies(
  response: Response,
  audience: Audience,
  config: AppConfigService,
): void {
  const names = audience === 'member' ? MEMBER_COOKIE : ADMIN_COOKIE;
  response.clearCookie(names.access, baseOptions(config, '/'));
  response.clearCookie(names.refresh, baseOptions(config, REFRESH_PATH[audience]));
  response.clearCookie(names.session, baseOptions(config, '/'));
}

export function authCookieNames(audience: Audience) {
  return audience === 'member' ? MEMBER_COOKIE : ADMIN_COOKIE;
}
