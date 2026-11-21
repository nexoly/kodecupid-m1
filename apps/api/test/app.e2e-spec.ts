import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import type { Agent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimiterService } from '../src/common/rate-limiter.service';
import { SMS_PROVIDER, type SmsProvider } from '../src/auth/sms/sms.provider';

/** 1×1 PNG — enough for the magic-byte check and the image pipeline. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * End-to-end coverage of the Milestone 1 contract against a real PostgreSQL +
 * PostGIS database (Neon in development/staging).
 *
 * Prerequisites: migrations applied and the seed run.
 */
describe('KodeCupid Milestone 1 (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let prisma: PrismaService;

  const prefix = `/${process.env.API_PREFIX ?? 'api/v1'}`;
  const debugCode = process.env.OTP_DEBUG_CODE ?? '246810';
  const termsVersion = process.env.TERMS_VERSION ?? '1.0';
  const guidelinesVersion = process.env.GUIDELINES_VERSION ?? '1.0';
  const safetyTipsVersion = process.env.SAFETY_TIPS_VERSION ?? '1.0';

  /** Captures the real (non-debug) codes the API would have texted. */
  const sentCodes = new Map<string, string>();
  const capturingSms: SmsProvider = {
    name: 'capture',
    codeSource: 'local',
    async sendOtp(phoneE164: string, code: string) {
      sentCodes.set(phoneE164, code);
    },
  };

  const newPhone = () =>
    `+88017${Math.floor(10_000_000 + Math.random() * 89_999_999).toString().slice(0, 8)}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(capturingSms)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    // Nest 12 only creates the HTTP server on listen(); port 0 avoids clashes.
    await app.listen(0, '127.0.0.1');
    httpServer = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const compliancePayload = (overrides: Record<string, unknown> = {}) => ({
    dateOfBirth: '1995-05-05',
    confirmAdult: true,
    acceptTerms: true,
    acceptGuidelines: true,
    acceptSafetyTips: true,
    termsVersion,
    guidelinesVersion,
    safetyTipsVersion,
    ...overrides,
  });

  describe('health', () => {
    it('reports the API and database as reachable', async () => {
      await request(httpServer)
        .get(`${prefix}/health`)
        .expect(200)
        .expect((response) => {
          expect(response.body.status).toBe('ok');
          expect(response.body.database).toBe('connected');
          expect(response.body.postgis).toBe('enabled');
        });

      await request(httpServer).get(`${prefix}/health/db`).expect(200);
    });

    it('lists the seeded regions with the 200-subscriber threshold', async () => {
      const response = await request(httpServer).get(`${prefix}/regions`).expect(200);
      const names = response.body.map((region: { name: string }) => region.name);
      expect(names).toEqual(expect.arrayContaining(['Atlanta', 'Charlotte']));
      for (const region of response.body) {
        expect(region.paidSubscriberThreshold).toBe(200);
        expect(region.launchStatus).toBeTruthy();
      }
    });
  });

  describe('registration → compliance → onboarding → profile', () => {
    let agent: Agent;
    const phone = newPhone();
    let profileId: string | undefined;

    beforeAll(() => {
      agent = request.agent(httpServer);
    });

    it('rejects an invalid phone number', async () => {
      await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone: '12', countryCode: 'BD' })
        .expect(400);
    });

    it('sends an OTP and verifies it', async () => {
      const otp = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      expect(otp.body.challengeId).toBeTruthy();

      const verified = await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: debugCode })
        .expect(200);

      expect(verified.body.created).toBe(true);
      expect(verified.body.session.compliance.required).toBe(true);
      expect(verified.body.session.compliance.missing).toEqual(
        expect.arrayContaining(['TERMS', 'COMMUNITY_GUIDELINES', 'SAFETY_TIPS']),
      );

      const cookies = verified.headers['set-cookie'] as unknown as string[];
      expect(cookies?.some((cookie) => cookie.startsWith('kc_at='))).toBe(true);
    });

    it('blocks protected routes until the age gate is completed', async () => {
      const response = await agent.get(`${prefix}/profile/me`).expect(403);
      expect(response.body.error.code).toBe('COMPLIANCE_REQUIRED');
    });

    it('blocks under-18 registrations and keeps the age gate closed', async () => {
      // Separate account: an under-18 submission locks the age gate for good.
      const minor = request.agent(httpServer);
      const otp = await minor
        .post(`${prefix}/auth/request-otp`)
        .send({ phone: newPhone(), countryCode: 'BD' })
        .expect(200);
      await minor
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: debugCode })
        .expect(200);

      const underageDob = new Date();
      underageDob.setUTCFullYear(underageDob.getUTCFullYear() - 17);

      const response = await minor
        .post(`${prefix}/compliance/accept`)
        .send(compliancePayload({ dateOfBirth: underageDob.toISOString().slice(0, 10) }))
        .expect(403);
      expect(response.body.error.code).toBe('AGE_RESTRICTED');

      // Re-entering an adult date of birth does not reopen the gate.
      const retry = await minor
        .post(`${prefix}/compliance/accept`)
        .send(compliancePayload())
        .expect(403);
      expect(retry.body.error.code).toBe('AGE_RESTRICTED');

      // And onboarding/profile stay closed.
      await minor.get(`${prefix}/profile/me`).expect(403);
      await minor.get(`${prefix}/onboarding/status`).expect(403);
    });

    it('requires Terms, Community Guidelines and Safety Tips to be accepted', async () => {
      await agent
        .post(`${prefix}/compliance/accept`)
        .send(compliancePayload({ acceptTerms: false }))
        .expect(400);

      await agent
        .post(`${prefix}/compliance/accept`)
        .send(compliancePayload({ acceptSafetyTips: false }))
        .expect(400);
    });

    it('accepts compliant registrations and records every document version', async () => {
      const response = await agent
        .post(`${prefix}/compliance/accept`)
        .send(compliancePayload())
        .expect(200);

      expect(response.body.compliance.required).toBe(false);

      const acceptances = await prisma.legalAcceptance.findMany({
        where: { userId: response.body.user.id },
        select: { documentType: true, documentVersion: true, acceptedAt: true },
      });
      const types = acceptances.map((acceptance) => acceptance.documentType);
      expect(types).toEqual(
        expect.arrayContaining(['TERMS', 'COMMUNITY_GUIDELINES', 'SAFETY_TIPS', 'PRIVACY']),
      );
      for (const acceptance of acceptances) {
        expect(acceptance.documentVersion).toBeTruthy();
        expect(acceptance.acceptedAt).toBeTruthy();
      }
    });

    it('exposes the onboarding checklist and saves each step through the contract endpoint', async () => {
      const initial = await agent.get(`${prefix}/onboarding/status`).expect(200);
      expect(initial.body.steps).toHaveLength(6);
      expect(initial.body.canComplete).toBe(false);

      const steps: [string, Record<string, unknown>][] = [
        ['welcome', {}],
        [
          'identity',
          {
            displayName: 'Test Member',
            dateOfBirth: '1995-05-05',
            genderIdentity: 'WOMAN',
            interestedIn: ['MEN'],
          },
        ],
        [
          'profession',
          {
            profession: 'Registered Nurse',
            professionCategory: 'HEALTHCARE',
            shiftSchedule: 'NIGHT',
          },
        ],
        ['location', { city: 'Atlanta', region: 'Georgia', country: 'US' }],
        [
          'preferences',
          { lookingFor: ['LONG_TERM'], ageRangeMin: 25, ageRangeMax: 40, maxDistanceKm: 30 },
        ],
        ['privacy', { visibility: [{ field: 'RELIGION', visibility: 'HIDDEN' }] }],
      ];

      for (const [step, data] of steps) {
        await agent.patch(`${prefix}/onboarding/step`).send({ step, data }).expect(200);
      }

      const state = await agent.get(`${prefix}/onboarding/status`).expect(200);
      expect(state.body.canComplete).toBe(true);
      expect(state.body.completedSteps).toHaveLength(6);
      expect(state.body.nextStep).toBe('complete');
    });

    it('refuses to complete the profile without at least one photo', async () => {
      const response = await agent.post(`${prefix}/onboarding/complete`).expect(403);
      expect(response.body.error.code).toBe('PHOTO_REQUIRED');
    });

    it('uploads a profile photo and completes onboarding', async () => {
      const upload = await agent
        .post(`${prefix}/profile/photos`)
        .attach('file', TINY_PNG, 'profile.png')
        .expect(200);

      expect(upload.body.photos).toHaveLength(1);
      expect(upload.body.photos[0].isPrimary).toBe(true);

      const completed = await agent.post(`${prefix}/onboarding/complete`).expect(200);
      expect(completed.body.onboarding.completed).toBe(true);
    });

    it('stores profession category and applies privacy defaults to the public view', async () => {
      const owner = await agent
        .patch(`${prefix}/profile/me`)
        .send({
          religion: 'Islam',
          ethnicity: 'Bengali',
          workplaceName: 'Grady Hospital',
          workplacePrivacyEnabled: false,
        })
        .expect(200);

      profileId = owner.body.id;
      expect(owner.body.professionCategory).toBe('HEALTHCARE');
      expect(owner.body.workplaceHideRadiusMeters).toBeNull();

      const publicView = await agent.get(`${prefix}/profiles/${profileId}`).expect(200);
      expect(publicView.body.religion).toBeUndefined();
      // Workplace is hidden by default (privacy-first), even before the explicit flag.
      expect(publicView.body.workplaceName).toBeUndefined();
      expect(publicView.body.hiddenFields).toEqual(
        expect.arrayContaining(['RELIGION', 'WORKPLACE']),
      );
      expect(publicView.body.latitude).toBeUndefined();
      expect(publicView.body.longitude).toBeUndefined();
    });

    it('hides the workplace when workplace privacy is enabled, even if the field is public', async () => {
      await agent
        .patch(`${prefix}/profile/privacy`)
        .send({ field: 'WORKPLACE', visibility: 'PUBLIC' })
        .expect(200);

      const visible = await agent.get(`${prefix}/profiles/${profileId}`).expect(200);
      expect(visible.body.workplaceName).toBe('Grady Hospital');

      // Turning the workplace privacy switch on overrides the public toggle.
      await agent
        .patch(`${prefix}/profile/me`)
        .send({ workplacePrivacyEnabled: true, workplaceHideRadiusMeters: 800 })
        .expect(200);

      const hidden = await agent.get(`${prefix}/profiles/${profileId}`).expect(200);
      expect(hidden.body.workplaceName).toBeUndefined();
      expect(hidden.body.hiddenFields).toContain('WORKPLACE');

      const owner = await agent.get(`${prefix}/profile/me`).expect(200);
      expect(owner.body.workplacePrivacyEnabled).toBe(true);
      expect(owner.body.workplaceHideRadiusMeters).toBe(800);
    });

    it('reveals a field only after the privacy toggle is switched on', async () => {
      await agent
        .patch(`${prefix}/profile/privacy`)
        .send({ field: 'RELIGION', visibility: 'PUBLIC' })
        .expect(200);

      const revealed = await agent.get(`${prefix}/profiles/${profileId}`).expect(200);
      expect(revealed.body.religion).toBe('Islam');
      expect(revealed.body.hiddenFields).not.toContain('RELIGION');
    });

    it('hides paused profiles from members but keeps the owner view', async () => {
      await agent.patch(`${prefix}/profile/pause`).expect(200);

      const response = await agent.get(`${prefix}/profiles/${profileId}`).expect(403);
      expect(response.body.error.code).toBe('PROFILE_PAUSED');

      const owner = await agent.get(`${prefix}/profile/me`).expect(200);
      expect(owner.body.status).toBe('PAUSED');

      await agent.patch(`${prefix}/profile/resume`).expect(200);
    });

    it('deletes a photo through the contract endpoint', async () => {
      const owner = await agent.get(`${prefix}/profile/me`).expect(200);
      const photoId = owner.body.photos[0].id;

      const removed = await agent.delete(`${prefix}/profile/photos/${photoId}`).expect(200);
      expect(removed.body.photos).toHaveLength(0);
    });

    it('keeps the session alive through a refresh rotation', async () => {
      await agent.post(`${prefix}/auth/refresh`).expect(200);
      await agent.get(`${prefix}/auth/me`).expect(200);
    });
  });

  describe('OTP security', () => {
    it('rejects a reused code', async () => {
      const agent = request.agent(httpServer);
      const phone = newPhone();
      const otp = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: debugCode })
        .expect(200);

      const reused = await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: debugCode })
        .expect(400);

      expect(reused.body.error.code).toBe('OTP_INVALID');
    });

    it('verifies the real texted code, stores only its hash, and refuses reuse', async () => {
      const agent = request.agent(httpServer);
      const phone = newPhone();
      const otp = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      const code = sentCodes.get(phone);
      expect(code).toMatch(/^\d{6}$/);

      const stored = await prisma.otpChallenge.findUniqueOrThrow({
        where: { id: otp.body.challengeId },
      });
      expect(stored.codeHash).not.toContain(code!);
      expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);

      await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code })
        .expect(200);

      const reused = await request(httpServer)
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code })
        .expect(400);
      expect(reused.body.error.code).toBe('OTP_INVALID');
    });

    it('lets only one of several simultaneous verifications use a code', async () => {
      const phone = newPhone();
      const otp = await request(httpServer)
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);
      const code = sentCodes.get(phone);

      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(httpServer)
            .post(`${prefix}/auth/verify-otp`)
            .send({ challengeId: otp.body.challengeId, code }),
        ),
      );
      expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    });

    it('invalidates an older code when a new one is requested', async () => {
      const phone = newPhone();
      const first = await request(httpServer)
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);
      const firstCode = sentCodes.get(phone);
      await request(httpServer)
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      await request(httpServer)
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: first.body.challengeId, code: firstCode })
        .expect(400);
    });

    it('locks a code after five wrong attempts, even with the right code', async () => {
      const phone = newPhone();
      const otp = await request(httpServer)
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);
      const code = sentCodes.get(phone)!;
      const wrong = code === '000000' ? '111111' : '000000';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(httpServer)
          .post(`${prefix}/auth/verify-otp`)
          .send({ challengeId: otp.body.challengeId, code: wrong })
          .expect(400);
      }

      const locked = await request(httpServer)
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code })
        .expect(429);
      expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('rejects an expired code', async () => {
      const agent = request.agent(httpServer);
      const phone = newPhone();
      const otp = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      await prisma.otpChallenge.update({
        where: { id: otp.body.challengeId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const expired = await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: debugCode })
        .expect(400);

      expect(expired.body.error.code).toBe('OTP_EXPIRED');
    });

    it('rate-limits OTP requests to three per phone per window', async () => {
      const agent = request.agent(httpServer);
      const phone = newPhone();

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await agent
          .post(`${prefix}/auth/request-otp`)
          .send({ phone, countryCode: 'BD' })
          .expect(200);
      }

      const limited = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(429);

      expect(limited.body.error.code).toBe('RATE_LIMITED');
    });

    it('rejects an incorrect code and counts the attempt', async () => {
      const agent = request.agent(httpServer);
      const phone = newPhone();
      const otp = await agent
        .post(`${prefix}/auth/request-otp`)
        .send({ phone, countryCode: 'BD' })
        .expect(200);

      const wrong = await agent
        .post(`${prefix}/auth/verify-otp`)
        .send({ challengeId: otp.body.challengeId, code: '000000' })
        .expect(400);

      expect(wrong.body.error.code).toBe('OTP_INVALID');
      expect(wrong.body.error.details.attemptsRemaining).toBe(4);
    });
  });

  describe('admin roles and permissions', () => {
    let superAgent: Agent;
    let moderatorAgent: Agent;

    beforeAll(() => {
      superAgent = request.agent(httpServer);
      moderatorAgent = request.agent(httpServer);
    });

    it('signs both seeded roles in', async () => {
      const superLogin = await superAgent
        .post(`${prefix}/admin/auth/login`)
        .send({
          email: process.env.SEED_ADMIN_EMAIL ?? 'admin@kodecupid.test',
          password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin1',
        })
        .expect(200);
      expect(superLogin.body.admin.role).toBe('SUPER_ADMIN');

      const moderatorLogin = await moderatorAgent
        .post(`${prefix}/admin/auth/login`)
        .send({
          email: process.env.SEED_MODERATOR_EMAIL ?? 'moderator@kodecupid.test',
          password: process.env.SEED_MODERATOR_PASSWORD ?? 'ChangeMe!Mod1',
        })
        .expect(200);
      expect(moderatorLogin.body.admin.role).toBe('MODERATOR');
    });

    it('locks admin sign-in after repeated wrong passwords, but never for successful sign-ins', async () => {
      const email = process.env.SEED_MODERATOR_EMAIL ?? 'moderator@kodecupid.test';
      const password = process.env.SEED_MODERATOR_PASSWORD ?? 'ChangeMe!Mod1';

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await request(httpServer)
          .post(`${prefix}/admin/auth/login`)
          .send({ email, password })
          .expect(200);
      }

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await request(httpServer)
          .post(`${prefix}/admin/auth/login`)
          .send({ email, password: 'definitely-wrong-password' });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses[5]).toBe(429);

      app.get(RateLimiterService).clear();
    });

    it('gives the Moderator the member list with masked phone numbers', async () => {
      const response = await moderatorAgent.get(`${prefix}/admin/users`).expect(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items[0].phone).toContain('•');
    });

    it('refuses role management, audit logs, settings and monetization to the Moderator', async () => {
      await moderatorAgent.get(`${prefix}/admin/roles`).expect(403);
      await moderatorAgent.get(`${prefix}/admin/audit-logs`).expect(403);
      await moderatorAgent.get(`${prefix}/admin/settings`).expect(403);
      await moderatorAgent.get(`${prefix}/admin/monetization`).expect(403);
      await moderatorAgent.delete(`${prefix}/admin/users/anything`).expect(403);
    });

    it('allows the Moderator into the queues they own', async () => {
      await moderatorAgent.get(`${prefix}/admin/complaints`).expect(200);
      await moderatorAgent.get(`${prefix}/admin/verification`).expect(200);
      await moderatorAgent.get(`${prefix}/admin/deletion-requests`).expect(200);
      await moderatorAgent.get(`${prefix}/admin/corrections`).expect(200);
    });

    it('lets the Super Admin reach everything', async () => {
      const users = await superAgent.get(`${prefix}/admin/users`).expect(200);
      expect(users.body.items.length).toBeGreaterThan(0);

      await superAgent.get(`${prefix}/admin/roles`).expect(200);
      await superAgent.get(`${prefix}/admin/audit-logs`).expect(200);
      await superAgent.get(`${prefix}/admin/settings`).expect(200);
      await superAgent.get(`${prefix}/admin/monetization`).expect(200);
    });

    it('assigns, updates and revokes a role by email, and audits every change', async () => {
      const email = `contract.${Date.now()}@kodecupid.test`;

      const assigned = await superAgent
        .post(`${prefix}/admin/roles/assign`)
        .send({ email, role: 'MODERATOR' })
        .expect(201);
      expect(assigned.body.assignmentId).toBeTruthy();
      expect(assigned.body.source).toBe('INVITATION');
      expect(assigned.body.inviteToken).toBeTruthy();

      const updated = await superAgent
        .patch(`${prefix}/admin/roles/${assigned.body.assignmentId}`)
        .send({ role: 'SUPER_ADMIN' })
        .expect(200);
      expect(updated.body.role).toBe('SUPER_ADMIN');

      const revoked = await superAgent
        .delete(`${prefix}/admin/roles/${assigned.body.assignmentId}`)
        .expect(200);
      expect(revoked.body.status).toBe('REVOKED');

      const logs = await superAgent.get(`${prefix}/admin/audit-logs`).expect(200);
      const actions = logs.body.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['role.assigned', 'role.updated', 'role.revoked']),
      );
    });

    it('applies a role change immediately for an existing admin', async () => {
      const assignments = await superAgent.get(`${prefix}/admin/roles`).expect(200);
      const moderator = assignments.body.find(
        (row: { email: string; role: string }) =>
          row.email === (process.env.SEED_MODERATOR_EMAIL ?? 'moderator@kodecupid.test') &&
          row.role === 'MODERATOR',
      );
      expect(moderator).toBeTruthy();

      await superAgent
        .patch(`${prefix}/admin/roles/${moderator.assignmentId}`)
        .send({ role: 'SUPER_ADMIN' })
        .expect(200);

      // The change is effective on the very next request.
      await moderatorAgent.get(`${prefix}/admin/roles`).expect(200);

      await superAgent
        .patch(`${prefix}/admin/roles/${moderator.assignmentId}`)
        .send({ role: 'MODERATOR' })
        .expect(200);

      await moderatorAgent.get(`${prefix}/admin/roles`).expect(403);
    });

    it('refuses to remove the last Super Admin', async () => {
      const assignments = await superAgent.get(`${prefix}/admin/roles`).expect(200);
      const superAdmin = assignments.body.find(
        (row: { role: string; source: string }) =>
          row.role === 'SUPER_ADMIN' && row.source === 'ADMIN',
      );
      expect(superAdmin).toBeTruthy();

      const response = await superAgent
        .patch(`${prefix}/admin/roles/${superAdmin.assignmentId}`)
        .send({ role: 'MODERATOR' })
        .expect(409);

      expect(response.body.error.code).toBe('LAST_SUPER_ADMIN');
    });

    it('blocks unauthenticated access to admin APIs', async () => {
      await request(httpServer).get(`${prefix}/admin/users`).expect(401);
      await request(httpServer).get(`${prefix}/admin/audit-logs`).expect(401);
    });
  });
});
