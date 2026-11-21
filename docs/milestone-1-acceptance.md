# Milestone 1 — acceptance record

Traceability from the client's Definition of Done to the code and the checks that prove it.

| Client requirement | Where it lives | How it is verified |
| --- | --- | --- |
| Register with a phone number and verify OTP | `apps/api/src/auth/otp.service.ts`, `auth.service.ts`, `apps/web/src/app/(auth)/register` + `/verify` | `test/app.e2e-spec.ts` → “sends an OTP and verifies it”; Playwright “member can register…” |
| Under-18 users are blocked | `compliance.service.ts` (`AGE_RESTRICTED`), server-side age check on every DOB write | e2e “blocks under-18 registrations”; Playwright “under-18 visitors are blocked”; unit `age-gate.spec.ts` (18 today vs one day short, leap day, UTC) |
| User cannot proceed without accepting Terms | `complianceAcceptSchema` (`z.literal(true)`), `ComplianceGuard` | e2e “requires explicit acceptance of both legal documents”; Playwright compliance step |
| Acceptance stored with timestamp + version | `LegalAcceptance` model (`documentType`, `documentVersion`, `acceptedAt`, ip, userAgent) | e2e compliance response; admin member detail shows the history |
| Guided onboarding, progress, back, resume | `onboarding.controller.ts`, `onboarding.service.ts`, `apps/web/src/components/onboarding/wizard.tsx` | e2e “saves each onboarding step and resumes from the server”; unit `onboarding.sequence.spec.ts`; Playwright full flow |
| Full profile + edit | `profile.service.ts`, `apps/web/src/app/(member)/profile(/edit)` | e2e profile patch; Playwright edit + save |
| Individual privacy toggles | `ProfileFieldVisibility`, `profile.mapper.ts`, `profile.controller.ts` | unit `profile.mapper.spec.ts` (defaults, overrides, coordinates never leak, photos hidden); e2e “applies privacy defaults and explicit overrides” |
| Profile pause / unpause | `Profile.status`, `ProfileService.setPaused`, `publicView` | e2e “hides paused profiles…”; Playwright pause switch |
| Data model supports workplace privacy / geofencing | `Profile.workplace*`, generated `locationPoint geography(Point,4326)` + GiST index | migration SQL review; schema fields present |
| Separate admin login | `AdminUser`, `AdminSession`, `admin-auth.controller.ts`, `apps/web/src/app/admin/login` | e2e “signs both seeded roles in” |
| Roles by email, enforced on every admin route | `packages/shared/src/permissions.ts`, `PermissionsGuard` (fail-closed) | unit `access.spec.ts`; e2e Moderator 403 matrix; “changes a role by email and refuses to remove the last Super Admin” |
| Super Admin sees everything, Moderator sees a subset | `ADMIN_NAV` + `navFor()` | e2e admin matrix; Playwright “admin roles see different navigation” |
| Users list in the admin shell | `apps/web/src/app/admin/(dashboard)/users`, `users.service.ts` | e2e `GET /admin/users`; Playwright |
| Loading / empty / error states | `components/ui/feedback.tsx` used by every data screen | manual + Playwright assertions on empty/error copy |
| Seed data: 1 Super Admin, 1 Moderator, 3–5 members | `apps/api/scripts/seed.ts` | `pnpm db:seed` output; e2e admin login |
| Staging deployment + credentials + test script | `render.yaml`, `apps/web/vercel.json`, `apps/api/Dockerfile`, `docs/deployment.md`, `docs/client-test-instructions.md` | deploy checklist in `docs/deployment.md` (executed when account tokens are provided) |

## Verification run (QA audit, 21 Nov 2026)

Executed against a local PostgreSQL 16.15 + PostGIS 3.4.2 database (standing in for Neon, which
needs the client's account credentials):

| Check | Result |
| --- | --- |
| `pnpm typecheck` / `pnpm lint` | ✅ 3 packages, no errors |
| `pnpm test` | ✅ 28/28 unit tests |
| `pnpm test:e2e` | ✅ 42/42 (API flows on the live database + staging OTP policy) |
| `pnpm test:web` | ✅ 6/6 Playwright flows, incl. a full 360px acceptance journey with no console errors and no horizontal scroll |
| `pnpm build` (shared + api + web) | ✅ |
| `prisma migrate deploy` / `status` | ✅ 4 migrations applied, schema up to date |
| `postgis_full_version()` | ✅ PostGIS 3.4.2 |
| `profiles.locationPoint` | ✅ `geography(Point,4326)` (generated from lat/lng) + GiST index |
| `pnpm db:seed` (run repeatedly) | ✅ idempotent: 2 admins, 5 sample members, Atlanta + Charlotte with the 200 threshold |
| `GET /api/v1/health` | ✅ `{ status: "ok", database: "connected", postgis: "enabled" }` |
| Staging-mode OTP policy (live server, `NODE_ENV=staging`) | ✅ debug code refused for real numbers, accepted only for allow-listed seeded numbers, never returned by the API |

### Defects found and fixed in the audit

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| 1 | Critical | On staging, the shared debug OTP worked for **every** phone number and was returned in the API response, so anyone could sign in to any real member's account. | Debug code accepted outside dev/test only for numbers in `OTP_DEBUG_PHONES`; never echoed outside dev/test; production still refuses it at boot. |
| 2 | High | No real SMS path for staging: `TWILIO_VERIFY_SERVICE_SID` existed but was unused, and the blueprint shipped `SMS_PROVIDER=console`. | Added a Twilio Verify provider (Twilio generates/checks the code); blueprint now uses `twilio`; production refuses the console provider. |
| 3 | High | OTP rate limit (3 per number per 15 min) was in memory: it reset on every deploy/restart and didn't hold across instances. | Counted from `otp_challenges` in the database. |
| 4 | Medium | OTP reuse/attempt race: parallel requests could consume one code twice or exceed 5 attempts. | Atomic conditional updates for attempts and consumption; a new code invalidates older open codes. |
| 5 | Medium | OTP codes stored as plain `sha256(code + secret)`. | HMAC-SHA256. |
| 6 | Medium | A blocked under-18 user could immediately re-submit an older date of birth. | `users.ageGateBlockedAt` (additive migration) keeps the gate closed once an under-18 date is submitted. |
| 7 | Medium | Health endpoint didn't check the database or PostGIS. | `/health` checks both and returns 503 with details when either fails. |
| 8 | Medium | A member who left mid-onboarding could open `/app` and skip the remaining steps. | Member shell sends them back to their saved step. |
| 9 | Medium | Admin login lockout counted successful sign-ins: 5 normal logins in 15 min locked the account. | Counter resets on success; only failures count. |
| 10 | Medium | The seed printed admin passwords to the logs, reset admins' changed roles/passwords on every run, and accepted the public default passwords on staging. | No passwords printed; existing admins are left unchanged; staging/production need unique 12+ character passwords. |
| 11 | Low | Default admin passwords and the debug code were published in README/docs/render.yaml. | Removed; credentials go privately to the client. |
| 12 | Low | Safety Tips missing from Settings and the auth fine print; compliance error named only two documents. | Copy updated to all three documents. |
| 13 | Low | `POST /auth/request-otp` rejected a full E.164 number without a separate `countryCode`. | `countryCode` is optional when the number starts with `+`. |
| 14 | Low | Missing `/favicon.ico` caused a 404 console error. | Added a favicon from the brand icon. |
| 15 | Test gap | Every OTP test used the debug code, so the real hashed-code path was never exercised. | e2e tests capture the real texted code (hash storage, reuse, race, supersede, 5-attempt lock). |

### Open blockers (need the client's or developer's accounts)

- **Staging deployment** (Vercel + Render/Railway) and the **Neon** database: no account
  credentials are available in this environment. The blueprint, Dockerfile, Vercel config and
  checklist are ready (`docs/deployment.md`).
- **Real SMS test**: needs a Twilio account (Account SID, Auth Token, Verify Service SID).
  The Twilio Verify integration is implemented but has not yet been run against Twilio itself.

## Second audit pass (21 Nov 2026, after PR #1)

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| 1 | High | The web app never used the refresh token: member and admin sessions ended after 15 minutes (route gate redirected to sign-in, API calls failed with 401). | API also sets a non-secret session marker cookie (`kc_s` / `kc_admin_s`) for the route gate; the web client refreshes once on 401 and retries. A 30-second grace window stops two tabs refreshing at once from being treated as token theft; an old token replayed later still ends every session. |
| 2 | Medium | Routes named in the brief (`/dashboard`, `/verify-otp`, `/onboarding`) did not exist. | Redirects to `/app` and `/verify`; `/onboarding` resumes the saved step. |
| 3 | Medium | Pause/resume was only in Settings, not on `/profile/privacy`. | Added the switch to the privacy page. |
| 4 | Medium | Onboarding steps could be saved out of order (completion was still blocked). | Backend refuses a step until all earlier steps are saved; editing earlier steps still works. |
| 5 | Low | Service Gold used outside verification (warnings, role badge, M2 badges, main-photo label, landing card). | Gold kept for the verification feature only; warnings use a separate caution colour. |
| 6 | Low | Touch targets under 44px (small buttons 36px, switches 24px, chips ~36px). | 44px on phones. |
| 7 | Low | Admin header logo rendered on a grey box; role badge invisible on navy. | Dark-background logo variant and a visible role pill. |
| 8 | Test gap | No unit tests for phone validation or OTP hashing/expiry; no browser test of the full "assign by email → moderator signs in" chain. | Added. |
| 9 | Medium | Review: concurrent refreshes of one token could all succeed and create several sessions (member and admin). | Old session claimed atomically in the same transaction as its replacement; a lost race returns 401 with `refreshRace`, a logout-revoked token stays terminal. Member side by CodeRabbit autofix (3865c15); admin side added here, with a test that fails without it. |
| 10 | Medium | Review: a tab losing the refresh race failed its request; logout during a refresh left a session alive. | Bounded retries on `refreshRace`; logout waits for in-flight refreshes and blocks new ones (3865c15). |
| 11 | Low | Review: privacy toggles could be overwritten by an older response; concurrent onboarding saves could drop a step. | Privacy switches are disabled while one saves (3865c15); onboarding progress row locked while merging (added here). |

Totals after this pass: 43 unit, 50 API, 10 browser tests.

## Verification commands

```bash
pnpm --filter @kodecupid/shared build
pnpm --filter api exec prisma generate
pnpm typecheck
pnpm test            # unit: privacy mapper, permission matrix, age gate, onboarding resume
pnpm test:e2e        # API flows (needs DATABASE_URL + seeded database)
pnpm test:web        # Playwright browser flows (needs both servers + browsers installed)
pnpm build           # production build of shared + api + web
```

## Deliberate Milestone 1 scope decisions

- **Admin queues are shells.** Verification, complaints, deletion requests, corrections, settings
  and monetization render permission-gated “Milestone 2” screens. The brief marks only the Users
  list as mandatory; the shells still exercise the permission guards end-to-end.
- **Swagger is replaced by `docs/api.md`.** Hand-written endpoint documentation was faster to keep
  accurate than decorating 30 handlers; the machine contract lives in `packages/shared` zod schemas.
- **No client data-fetching library.** The web app uses a small typed `apiFetch` helper plus React
  state instead of TanStack Query, to keep the Milestone 1 bundle and dependency surface small.
- **Invitations are link-based, not emailed.** Email delivery is not part of Milestone 1; a Super
  Admin copies the one-time invite link from the UI.
- **Legal text is placeholder but versioned.** Replacing it with counsel-approved text is a
  configuration change (`TERMS_VERSION` etc.) that forces re-acceptance by design.
