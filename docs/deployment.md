# Deployment

Milestone 1 targets **Vercel** (web) + **Render or Railway** (API) + a hosted **PostgreSQL 16 with
PostGIS**.

> **PostGIS is mandatory.** Supabase and Neon both support `CREATE EXTENSION postgis`. Render's
> managed PostgreSQL does not, so point `DATABASE_URL` at Supabase/Neon instead of a Render
> database.

---

## 1. Database (Neon PostgreSQL 16 + PostGIS)

1. Create a Neon project on **PostgreSQL 16**.
2. Copy both connection strings from the Neon dashboard (each must end with `sslmode=require`):
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` — used by the running API.
   - **Direct** → `DATABASE_URL_UNPOOLED` — used only by the Prisma CLI (migrations) and the seed
     script. Poolers break DDL and advisory locks, so migrations must never use the pooled URL.
3. Migrations enable PostGIS automatically (the first migration runs
   `CREATE EXTENSION IF NOT EXISTS postgis`). Verify with `SELECT postgis_full_version();` or
   `GET /api/v1/health`, which reports `"postgis": "enabled"`.

Moving to AWS RDS PostgreSQL later only changes these two variables (RDS supports PostGIS; with
no pooler in front, set both to the same URL).

## 2. Environment variables

### API (`apps/api`)

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `staging` on the client-test service, `production` for a real launch (debug OTP and the console SMS provider are refused at boot) |
| `PORT` | no | defaults to `4000` |
| `API_PREFIX` | no | defaults to `api/v1` |
| `DATABASE_URL` | yes | Neon **pooled** URL (`sslmode=require`), used by the API |
| `DATABASE_URL_UNPOOLED` | yes (Neon) | Neon **direct** URL, used by migrations + seed |
| `PUBLIC_API_URL` | yes | e.g. `https://kodecupid-api.onrender.com` — used for photo URLs |
| `CORS_ORIGINS` | yes | comma-separated web origins |
| `JWT_ACCESS_SECRET` | yes | 32+ chars; generate two different random values |
| `JWT_REFRESH_SECRET` | yes | 32+ chars |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `JWT_REFRESH_TTL_DAYS` | no | default `30` |
| `COOKIE_SECURE` | yes (prod) | `true` behind HTTPS |
| `SMS_PROVIDER` | yes | `twilio` on staging/production (`console` is for local development only) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | if Twilio | from the Twilio console |
| `TWILIO_VERIFY_SERVICE_SID` | recommended | Twilio Verify service (`VA…`). Without it, set `TWILIO_FROM_NUMBER` to send raw SMS instead |
| `OTP_ALLOW_DEBUG_CODE` | staging | must be `false` in production (the API refuses to boot otherwise) |
| `OTP_DEBUG_CODE` | staging | 6-digit test code; share it privately with the client |
| `OTP_DEBUG_PHONES` | staging | comma-separated E.164 numbers that may use the debug code (the seeded sample members). Every other number needs the real SMS code. Never returned by the API outside development |
| `STORAGE_DRIVER` | yes | `local` (needs a volume) or `s3` |
| `TERMS_VERSION` / `GUIDELINES_VERSION` / `SAFETY_TIPS_VERSION` / `PRIVACY_VERSION` | yes | bump to force re-acceptance |
| `SEED_*` | once | admin emails/passwords used by `db:seed`. On staging/production the seed refuses the development defaults and passwords under 12 characters. Re-running the seed never overwrites an admin's changed role or password (set `SEED_RESET_ADMIN_PASSWORDS=true` to force) |

### Web (`apps/web`)

| Variable | Required | Notes |
| --- | --- | --- |
| `API_PROXY_TARGET` | yes | server-side origin of the API, e.g. `https://kodecupid-api.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | no | canonical URL |

The browser never talks to the API host directly: `next.config.ts` rewrites `/api/*` to
`API_PROXY_TARGET`, which keeps the auth cookies first-party.

## 3. Migrations and seed

```bash
# with DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct) exported
pnpm --filter @kodecupid/shared build
pnpm --filter api exec prisma generate
pnpm --filter api db:deploy     # prisma migrate deploy
pnpm --filter api db:seed       # 1 super admin, 1 moderator, 5 sample members
```

Creating a new migration without a shadow database (Prisma 7 flags):

```bash
# 1. edit apps/api/prisma/schema.prisma
# 2. diff the already-migrated database against the schema and save the SQL
pnpm --filter api db:diff:next > apps/api/prisma/migrations/<timestamp>_<name>/migration.sql
# 3. review the SQL, then apply it
pnpm --filter api db:deploy
```

## 4. API on Render (blueprint included)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, select the repository. `render.yaml` creates the Docker service.
3. Fill the `sync: false` variables: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PUBLIC_API_URL`
   (the Render URL), `CORS_ORIGINS` (the Vercel URL), the three `TWILIO_*` values,
   `OTP_DEBUG_CODE`, and the four `SEED_*` values.
4. Deploy. Pending migrations run automatically before the new version starts
   (`preDeployCommand`). Health check: `GET https://<service>/api/v1/health` must return
   `"database": "connected", "postgis": "enabled"`.
5. Seed once (from the Render shell, or locally with the staging URLs exported):
   `pnpm --filter api db:seed`.
6. Keep the `kodecupid-storage` disk attached (1 GB) — photos are stored on it under the `local`
   driver.

Railway alternative: create a service from the repository with
`Dockerfile = apps/api/Dockerfile`, root directory `/`, set the same variables, attach a volume at
`/app/apps/api/storage`, and set the health check path to `/api/v1/health`.

## 5. Web on Vercel

1. **New Project → import repository.**
2. **Root Directory:** `apps/web`.
3. Enable **Include files outside the Root Directory in the Build Step**.
4. Framework preset: Next.js (the included `vercel.json` sets install/build commands).
5. Environment variables: `API_PROXY_TARGET` (the API URL, no trailing slash),
   `NEXT_PUBLIC_SITE_URL` (the Vercel URL).
6. Deploy, then copy the production URL into the API's `CORS_ORIGINS` and `PUBLIC_API_URL` if the
   API is behind a custom domain.

## 6. Post-deploy smoke checklist

- [ ] `GET /api/v1/health` returns `status: ok`, `database: connected`, `postgis: enabled`
- [ ] A real phone number receives an SMS code and can verify it
- [ ] A seeded test number signs in with the private debug code; a real number cannot use it
- [ ] Verify → compliance → onboarding → member home works on a phone-sized viewport
- [ ] A hidden field is missing from the member-facing profile response
- [ ] Pausing the profile hides it from other members
- [ ] Super Admin and Moderator both sign in; the Moderator's menu is smaller
- [ ] A member photo loads (confirms storage + `PUBLIC_API_URL`)
- [ ] `OTP_ALLOW_DEBUG_CODE` is **false** before any real launch

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| API exits at boot with “Invalid environment configuration” | a required variable is missing or `JWT_*` is shorter than 32 chars |
| Migration fails on `CREATE EXTENSION postgis` | the database provider does not allow PostGIS; switch to Supabase/Neon |
| Browser is redirected to `/login` right after signing in | `COOKIE_SECURE=true` on a non-HTTPS origin, or `API_PROXY_TARGET` is wrong |
| `401` on every API call after a redeploy | JWT secrets changed; all sessions are invalidated by design |
| Uploaded photos disappear after a deploy | no persistent disk attached while `STORAGE_DRIVER=local` |
| Real SMS not arriving | `SMS_PROVIDER=twilio`, account SID + auth token, and either `TWILIO_VERIFY_SERVICE_SID` or a verified `TWILIO_FROM_NUMBER`. Twilio trial accounts only text numbers verified in the Twilio console |
| `GET /health` returns 503 | the JSON body says which part failed: `database: disconnected` (check `DATABASE_URL`/`sslmode=require`) or `postgis: missing` (run migrations) |
