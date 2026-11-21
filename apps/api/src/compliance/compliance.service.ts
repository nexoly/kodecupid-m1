import { Injectable } from '@nestjs/common';
import {
  isAdult,
  LEGAL_DOCUMENTS,
  type ComplianceDocumentView,
  type ComplianceAcceptInput,
  type MemberSession,
} from '@kodecupid/shared';
import { legalVersionsOf } from '../config/app-config';
import { AppConfigService } from '../config/app-config.module';
import { ErrorCode, errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { MemberSessionService } from '../auth/member-session.service';
import type { MemberRecord } from '../auth/auth.types';
import type { RequestMeta } from '../auth/auth.service';

const MEMBER_INCLUDE = {
  legalAcceptances: true,
  profile: true,
  onboarding: true,
} as const;

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly sessions: MemberSessionService,
  ) {}

  documents(): ComplianceDocumentView[] {
    const versions = legalVersionsOf(this.config.env);
    return LEGAL_DOCUMENTS.map((document) => ({
      ...document,
      version:
        document.type === 'TERMS'
          ? versions.terms
          : document.type === 'COMMUNITY_GUIDELINES'
            ? versions.guidelines
            : document.type === 'SAFETY_TIPS'
              ? versions.safetyTips
              : versions.privacy,
    }));
  }

  async accept(
    member: MemberRecord,
    input: ComplianceAcceptInput,
    meta: RequestMeta,
  ): Promise<MemberSession> {
    const versions = legalVersionsOf(this.config.env);

    if (input.termsVersion !== versions.terms) {
      throw errors.conflict(
        ErrorCode.TERMS_VERSION_MISMATCH,
        'The Terms of Service were updated. Please review and accept the current version.',
        { expected: versions.terms, received: input.termsVersion },
      );
    }

    if (input.guidelinesVersion !== versions.guidelines) {
      throw errors.conflict(
        ErrorCode.TERMS_VERSION_MISMATCH,
        'The Community Guidelines were updated. Please review and accept the current version.',
        { expected: versions.guidelines, received: input.guidelinesVersion },
      );
    }

    if (input.safetyTipsVersion !== versions.safetyTips) {
      throw errors.conflict(
        ErrorCode.TERMS_VERSION_MISMATCH,
        'The Safety Tips were updated. Please review and accept the current version.',
        { expected: versions.safetyTips, received: input.safetyTipsVersion },
      );
    }

    if (member.ageGateBlockedAt) {
      throw errors.forbidden(
        ErrorCode.AGE_RESTRICTED,
        'KodeCupid is only available to people aged 18 and over.',
        { minimumAge: 18 },
      );
    }

    const dateOfBirth = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.getTime() > Date.now()) {
      throw errors.validation('Enter a valid date of birth', {
        fieldErrors: { dateOfBirth: 'Enter a valid date of birth' },
      });
    }

    if (!isAdult(dateOfBirth, new Date(), 18)) {
      await this.prisma.user.update({
        where: { id: member.id },
        data: { ageGateBlockedAt: new Date() },
      });
      throw errors.forbidden(
        ErrorCode.AGE_RESTRICTED,
        'KodeCupid is only available to people aged 18 and over.',
        { minimumAge: 18 },
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.id },
        data: {
          ageVerifiedAt: now,
          ...(member.status === 'PENDING_COMPLIANCE' ? { status: 'ACTIVE' } : {}),
        },
      });

      await tx.profile.upsert({
        where: { userId: member.id },
        create: { userId: member.id, dateOfBirth },
        update: { dateOfBirth },
      });

      const acceptances = [
        { documentType: 'TERMS' as const, documentVersion: versions.terms },
        {
          documentType: 'COMMUNITY_GUIDELINES' as const,
          documentVersion: versions.guidelines,
        },
        { documentType: 'SAFETY_TIPS' as const, documentVersion: versions.safetyTips },
        { documentType: 'PRIVACY' as const, documentVersion: versions.privacy },
      ];

      for (const acceptance of acceptances) {
        await tx.legalAcceptance.upsert({
          where: {
            userId_documentType_documentVersion: {
              userId: member.id,
              documentType: acceptance.documentType,
              documentVersion: acceptance.documentVersion,
            },
          },
          create: {
            userId: member.id,
            documentType: acceptance.documentType,
            documentVersion: acceptance.documentVersion,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
          update: {},
        });
      }

      await tx.onboardingProgress.upsert({
        where: { userId: member.id },
        create: { userId: member.id },
        update: {},
      });
    });

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      include: MEMBER_INCLUDE,
    });

    return this.sessions.build(updated);
  }
}
