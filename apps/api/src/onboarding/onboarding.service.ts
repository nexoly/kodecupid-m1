import { Injectable } from '@nestjs/common';
import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEP_VALUES,
  type IdentityStepInput,
  type LocationStepInput,
  type MemberSession,
  type OnboardingStatus,
  type OnboardingStep,
  type PreferencesStepInput,
  type PrivacyStepInput,
  type ProfessionStepInput,
} from '@kodecupid/shared';
import { ErrorCode, errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { MemberSessionService } from '../auth/member-session.service';
import { ProfileService } from '../profile/profile.service';
import { nextIncompleteStep, ONBOARDING_SEQUENCE } from './onboarding.sequence';

const MEMBER_INCLUDE = {
  legalAcceptances: true,
  profile: true,
  onboarding: true,
} as const;

export interface StepSaveResult {
  status: OnboardingStatus;
  nextStep: OnboardingStep;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: ProfileService,
    private readonly sessions: MemberSessionService,
  ) {}

  async state(userId: string): Promise<OnboardingStatus> {
    const progress = await this.ensureProgress(userId);
    const completedSteps = progress.completedSteps as OnboardingStep[];
    const completed = progress.completedAt !== null;
    const done = new Set(completedSteps);

    return {
      completed,
      nextStep: completed ? 'complete' : nextIncompleteStep(completedSteps),
      completedSteps,
      steps: ONBOARDING_SEQUENCE.map((step) => ({
        step,
        label: ONBOARDING_STEP_LABELS[step],
        completed: done.has(step),
      })),
      canComplete: completed || ONBOARDING_SEQUENCE.every((step) => done.has(step)),
    };
  }

  /**
   * Saves one step and advances progress. Step data lands in the same tables
   * the profile screens edit, so there is no separate "draft profile".
   */
  async saveStep(userId: string, step: OnboardingStep, payload: unknown): Promise<StepSaveResult> {
    // Steps are saved in order: a later step cannot be stored before the
    // earlier ones (going back to edit an earlier step is always allowed).
    const existing = await this.ensureProgress(userId);
    const done = existing.completedSteps as OnboardingStep[];
    const earlier = ONBOARDING_SEQUENCE.slice(0, ONBOARDING_SEQUENCE.indexOf(step));
    const skipped = earlier.filter((previous) => !done.includes(previous));
    if (skipped.length > 0) {
      throw errors.forbidden(
        ErrorCode.ONBOARDING_INCOMPLETE,
        'Please finish the earlier onboarding steps first.',
        { missing: skipped },
      );
    }

    switch (step) {
      case 'welcome':
        break;

      case 'identity': {
        const input = payload as IdentityStepInput;
        await this.profile.update(userId, {
          displayName: input.displayName,
          dateOfBirth: input.dateOfBirth,
          genderIdentity: input.genderIdentity,
          ...(input.genderIdentityOther !== undefined
            ? { genderIdentityOther: input.genderIdentityOther }
            : {}),
          interestedIn: input.interestedIn,
        });
        break;
      }

      case 'profession': {
        const input = payload as ProfessionStepInput;
        await this.profile.update(userId, {
          profession: input.profession,
          professionCategory: input.professionCategory,
          ...(input.employerName !== undefined ? { employerName: input.employerName } : {}),
          shiftSchedule: input.shiftSchedule,
          ...(input.shiftNotes !== undefined ? { shiftNotes: input.shiftNotes } : {}),
        });
        break;
      }

      case 'location': {
        const input = payload as LocationStepInput;
        await this.profile.update(userId, {
          city: input.city,
          ...(input.region !== undefined ? { region: input.region } : {}),
          country: input.country,
          ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
          ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        });
        break;
      }

      case 'preferences': {
        const input = payload as PreferencesStepInput;
        await this.prisma.userPreference.upsert({
          where: { userId },
          create: {
            userId,
            lookingFor: input.lookingFor,
            ageRangeMin: input.ageRangeMin,
            ageRangeMax: input.ageRangeMax,
            maxDistanceKm: input.maxDistanceKm,
          },
          update: {
            lookingFor: input.lookingFor,
            ageRangeMin: input.ageRangeMin,
            ageRangeMax: input.ageRangeMax,
            maxDistanceKm: input.maxDistanceKm,
          },
        });
        await this.profile.update(userId, { relationshipGoals: input.lookingFor });
        break;
      }

      case 'privacy': {
        const input = payload as PrivacyStepInput;
        for (const update of input.visibility) {
          await this.profile.setVisibility(userId, update.field, update.visibility);
        }
        break;
      }

      default:
        throw errors.validation('That onboarding step cannot be saved', {
          code: ErrorCode.ONBOARDING_STEP_UNKNOWN,
        });
    }

    const progress = await this.ensureProgress(userId);
    const completed = Array.from(
      new Set([...(progress.completedSteps as OnboardingStep[]), step]),
    ) as OnboardingStep[];
    const nextStep = nextIncompleteStep(completed);

    await this.prisma.onboardingProgress.update({
      where: { userId },
      data: { completedSteps: completed, currentStep: nextStep },
    });

    return {
      status: await this.state(userId),
      nextStep,
    };
  }

  async complete(userId: string): Promise<MemberSession> {
    const progress = await this.ensureProgress(userId);
    const completedSteps = progress.completedSteps as OnboardingStep[];
    const missing = ONBOARDING_SEQUENCE.filter((step) => !completedSteps.includes(step));

    if (missing.length > 0) {
      throw errors.forbidden(
        ErrorCode.ONBOARDING_INCOMPLETE,
        'Please finish the remaining onboarding steps first.',
        { missing },
      );
    }

    // A profile is only complete with at least one photo (Milestone 1 required field).
    const photoCount = await this.prisma.profilePhoto.count({
      where: { profile: { userId } },
    });
    if (photoCount === 0) {
      throw errors.forbidden(
        ErrorCode.PHOTO_REQUIRED,
        'Add at least one profile photo to finish your profile.',
        { missing: ['PHOTOS'] },
      );
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: now, status: 'ACTIVE' },
    });
    await this.prisma.onboardingProgress.update({
      where: { userId },
      data: { completedAt: now, currentStep: 'complete', completedSteps: ONBOARDING_SEQUENCE },
    });

    const member = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: MEMBER_INCLUDE,
    });

    return this.sessions.build(member);
  }

  private async ensureProgress(userId: string) {
    const existing = await this.prisma.onboardingProgress.findUnique({ where: { userId } });
    if (existing) return existing;

    return this.prisma.onboardingProgress.create({ data: { userId } });
  }

  static isPatchableStep(step: string): step is OnboardingStep {
    return (ONBOARDING_STEP_VALUES as readonly string[]).includes(step) && step !== 'complete';
  }
}
