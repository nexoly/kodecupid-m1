import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable error codes. The web app maps these to friendly copy, so
 * they must stay stable even when the wording changes.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_RESEND_TOO_SOON: 'OTP_RESEND_TOO_SOON',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  INVALID_PHONE: 'INVALID_PHONE',

  AGE_RESTRICTED: 'AGE_RESTRICTED',
  COMPLIANCE_REQUIRED: 'COMPLIANCE_REQUIRED',
  TERMS_VERSION_MISMATCH: 'TERMS_VERSION_MISMATCH',

  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  ONBOARDING_STEP_UNKNOWN: 'ONBOARDING_STEP_UNKNOWN',

  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  PROFILE_PAUSED: 'PROFILE_PAUSED',
  PHOTO_LIMIT_REACHED: 'PHOTO_LIMIT_REACHED',
  PHOTO_INVALID: 'PHOTO_INVALID',
  PHOTO_REQUIRED: 'PHOTO_REQUIRED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',

  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  INVITATION_INVALID: 'INVITATION_INVALID',

  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    super({ code, message, details, statusCode: status }, status);
    this.code = code;
  }
}

export function appError(
  status: HttpStatus,
  code: ErrorCode,
  message: string,
  details?: unknown,
): AppException {
  return new AppException(status, code, message, details);
}

export const errors = {
  validation: (message = 'Some details need fixing', details?: unknown) =>
    appError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, message, details),
  unauthenticated: (message = 'Please sign in to continue', details?: unknown) =>
    appError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, message, details),
  notFound: (message = 'Not found') =>
    appError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message),
  conflict: (code: ErrorCode, message: string, details?: unknown) =>
    appError(HttpStatus.CONFLICT, code, message, details),
  forbidden: (code: ErrorCode, message: string, details?: unknown) =>
    appError(HttpStatus.FORBIDDEN, code, message, details),
  tooManyRequests: (code: ErrorCode, message: string, details?: unknown) =>
    appError(HttpStatus.TOO_MANY_REQUESTS, code, message, details),
} as const;
