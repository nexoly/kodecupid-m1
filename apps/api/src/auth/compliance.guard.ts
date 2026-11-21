import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode, errors } from '../common/errors';
import type { MemberAudienceUser } from './auth.types';
import { MemberSessionService } from './member-session.service';

/**
 * Blocks everything that needs a complete, compliant account until the age
 * gate and both mandatory legal documents are accepted.
 */
@Injectable()
export class ComplianceGuard implements CanActivate {
  constructor(private readonly sessions: MemberSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ member?: MemberAudienceUser }>();
    const member = request.member;
    if (!member) {
      throw errors.unauthenticated();
    }

    const compliance = this.sessions.complianceOf(member.user);
    if (!compliance.ageVerified) {
      throw errors.forbidden(
        ErrorCode.COMPLIANCE_REQUIRED,
        'Confirm your date of birth to continue.',
        { missing: ['AGE'] },
      );
    }

    if (compliance.missing.length > 0) {
      throw errors.forbidden(
        ErrorCode.COMPLIANCE_REQUIRED,
        'Accept the Terms of Service, Community Guidelines and Safety Tips to continue.',
        { missing: compliance.missing },
      );
    }

    return true;
  }
}
