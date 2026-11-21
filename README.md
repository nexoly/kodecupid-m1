# KodeCupid

Dating platform for shift workers — **Milestone 1** foundation: phone-OTP registration, 18+ age gate,
mandatory legal acceptance, guided onboarding, a full profile with per-field privacy, and a
role-based admin area (Super Admin + Moderator).

| Package | Purpose | Stack |
| --- | --- | --- |
| [`apps/web`](./apps/web) | Member + admin frontend | Next.js 15.5 (App Router), React 19, Tailwind 4 |
| [`apps/api`](./apps/api) | REST API | NestJS 12, Prisma 7, PostgreSQL 16 + PostGIS |
| [`packages/shared`](./packages/shared) | Shared types, enums, zod schemas, permission matrix | TypeScript |

## Milestone 1 in pictures

| Member profile (mobile) | Admin — Super Admin | Admin — Moderator |
| --- | --- | --- |
| ![Member profile](docs/screens/03-member-profile-mobile.png) | ![Super Admin members](docs/screens/04-admin-users-super-admin.png) | ![Moderator members](docs/screens/05-admin-users-moderator.png) |

The Moderator sees masked phone numbers and a smaller menu; the Super Admin sees full contact
details, role management, settings and monetization. Compare
[Super Admin](docs/screens/04-admin-users-super-admin.png) with
[Moderator](docs/screens/05-admin-users-moderator.png).

## Verified end-to-end

| Check | Command | Status |
| --- | --- | --- |
| Static types (3 packages) | `pnpm typecheck` | ✅ |
| Unit tests: privacy filtering, age gate, permission matrix, onboarding resume, phone validation, OTP hashing | `pnpm test` | ✅ 43 passed |
| API flows against PostgreSQL + PostGIS (incl. real hashed OTP path, OTP race and expiry, staging OTP policy, session refresh, onboarding order) | `pnpm test:e2e` | ✅ 50 passed |
| Browser flows at 360px (register → onboarding back/resume → profile edit → API-enforced privacy → pause → re-login; admin assigns a role by email → invitee signs in as Moderator → permission checks → revoke; session refresh) | `pnpm test:web` | ✅ 10 passed |
| Production builds | `pnpm build` | ✅ |

## Running it right now (local)

The dev stack runs on the hosted PostGIS database configured in `apps/api/.env`:

| Surface | URL |
| --- | --- |
| Member app | http://localhost:3000 |
| Admin area | http://localhost:3000/admin/login |
| API | http://localhost:4000/api/v1/health |

Seeded admin logins and the development OTP code come from `apps/api/.env` (see `.env.example`;
the defaults are for local development only and the seed refuses them on staging/production).
Staging credentials are shared privately, never in the repository. The client-facing walkthrough
is [`docs/client-test-instructions.md`](./docs/client-test-instructions.md).

## Quick start

```bash
pnpm install
cp .env.example .env                 # database credentials for docker compose
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local

docker compose up -d                 # PostgreSQL 16 + PostGIS
pnpm db:generate
pnpm db:deploy                       # apply migrations
pnpm db:seed                         # super admin, moderator, 5 sample members
pnpm dev                             # web on :3000, api on :4000
```

Full setup, troubleshooting, deployment and the client test script live in [`docs/`](./docs).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Build shared package, then run web + api in parallel |
| `pnpm build` | Production build for all packages |
| `pnpm typecheck` / `pnpm lint` | Static checks across the monorepo |
| `pnpm test` | Unit tests (API + shared) |
| `pnpm test:e2e` | API end-to-end tests (needs `DATABASE_URL`) |
| `pnpm test:web` | Playwright browser tests |
| `pnpm db:migrate:new` | Generate a new SQL migration from the Prisma schema |
| `pnpm db:deploy` | Apply pending migrations (safe for staging/production) |
| `pnpm db:seed` | Idempotent seed of admin accounts and sample members |
| `pnpm db:studio` | Prisma Studio |

## Milestone 1 scope

In scope: registration → age gate + legal acceptance → guided onboarding → profile with privacy toggles
and pause → admin roles with enforced permissions → seed data → handover docs and deploy configuration.

Out of scope (later milestones): matching/discovery, messaging, payments, provider verification review,
admin 2FA, i18n, native apps, and production document moderation.
