# Deployment

Milestone 1 targets **Vercel** (web) + **Render or Railway** (API) + a hosted **PostgreSQL 16 with
PostGIS**.

> **PostGIS is mandatory.** Supabase and Neon both support `CREATE EXTENSION postgis`. Render's
> managed PostgreSQL does not, so point `DATABASE_URL` at Supabase/Neon instead of a Render
> database.

---

## 1. Database

1. Create a PostgreSQL 16 database on Supabase or Neon.
2. Copy the connection string. If the provider offers a pooled and a direct URL, use the **direct**
   URL for migrations and the pooled URL for the API, or simply use the direct URL for both in
   Milestone 1.
3. Ensure `DATABASE_URL` has `?schema=public`.

Migrations run the PostGIS setup automatically (`prisma/migrations/*_init` starts with
`CREATE EXTENSION IF NOT EXISTS postgis`). If the provider blocks the extension, the migration
fails loudly instead of creating a database without geographic support.

## 2. Environment variables

### API (`apps/api`)

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `staging` on the client-test service (allows the debug OTP), `production` for a real launch (debug OTP refused at boot) |
| `PORT` | no | defaults to `4000` |
| `API_PREFIX` | no | defaults to `api/v1` |
| `DATABASE_URL` | yes | PostgreSQL + PostGIS connection string |
| `PUBLIC_API_URL` | yes | e.g. `https://kodecupid-api.onrender.com` — used for photo URLs |
| `CORS_ORIGINS` | yes | comma-separated web origins |
| `JWT_ACCESS_SECRET` | yes | 32+ chars; generate two different random values |
| `JWT_REFRESH_SECRET` | yes | 32+ chars |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `JWT_REFRESH_TTL_DAYS` | no | default `30` |
| `COOKIE_SECURE` | yes (prod) | `true` behind HTTPS |
| `SMS_PROVIDER` | yes | `console` or `twilio` |
| `OTP_DEBUG_CODE` | staging | fixed code for client testing |
| `OTP_ALLOW_DEBUG_CODE` | staging | must be `false` in production (the API refuses to boot otherwise) |
| `TWILIO_*` | if Twilio | account SID, auth token, from-number |
| `STORAGE_DRIVER` | yes | `local` (needs a volume) or `s3` |
| `TERMS_VERSION` / `GUIDELINES_VERSION` / `PRIVACY_VERSION` | yes | bump to force re-acceptance |
| `SEED_*` | once | credentials used by `db:seed` |

### Web (`apps/web`)

| Variable | Required | Notes |
| --- | --- | --- |
| `API_PROXY_TARGET` | yes | server-side origin of the API, e.g. `https://kodecupid-api.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | no | canonical URL |

The browser never talks to the API host directly: `next.config.ts` rewrites `/api/*` to
`API_PROXY_TARGET`, which keeps the auth cookies first-party.

## 3. Migrations and seed

```bash
# locally, with DATABASE_URL exported
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

## 4. Deploy the full stack on Railway

Use one Railway service for the API and one for the web app. Both Dockerfiles expect the repository
root as the build context:

1. Push the repository to GitHub and create a Railway project from it.
2. Add an API service from the repository. Set its root directory to `/` and Dockerfile path to
   `/apps/api/Dockerfile`. Add the API variables from section 2. Set `PUBLIC_API_URL` to the
   service's public HTTPS URL and `CORS_ORIGINS` to the web service's public origin.
3. Add a volume to the API service mounted at `/app/apps/api/storage`; keep `STORAGE_DRIVER=local`.
   Without a persistent volume, uploaded photos are lost on redeploy.
4. Configure the API health check path as `/api/v1/health` and generate a public domain for it.
5. Before creating the web deployment, set `API_PROXY_TARGET` on the web service to the API's
   public HTTPS URL (no trailing slash). This is used by Next.js rewrites during the build, so
   configure it before building and redeploy the web service if the API URL changes.
6. Add a web service from the same repository. Set its root directory to `/` and Dockerfile path to
   `/apps/web/Dockerfile`. Set `NEXT_PUBLIC_SITE_URL` to the web service's public HTTPS origin and
   generate a public domain. The container listens on Railway's `PORT` (defaulting to 3000).
7. Set `DATABASE_URL` on the API to an external PostgreSQL URL with PostGIS enabled (for example
   Supabase or Neon). Confirm it includes `?schema=public`.
8. Run `pnpm --filter api db:deploy` once against that database, then run `pnpm --filter api db:seed`
   if you need the sample accounts. Do not put database credentials in source control.
9. Verify `GET https://<api-domain>/api/v1/health` and
   `GET https://<api-domain>/api/v1/health/db` both return `ok`, then test the web app.

Use unique random values for both JWT secrets. For a real launch, set `NODE_ENV=production`,
`OTP_ALLOW_DEBUG_CODE=false`, and configure a real SMS provider; the staging defaults intentionally
allow a debug OTP.

### API on Render (blueprint included)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, select the repository. `render.yaml` creates the Docker service.
3. Fill the `sync: false` variables: `DATABASE_URL`, `PUBLIC_API_URL` (the Render URL),
   `CORS_ORIGINS` (the web URL), and the four `SEED_*` values.
4. Deploy. Health check: `GET https://<service>/api/v1/health`.
5. Run migrations + seed once against the staging `DATABASE_URL`.
6. Keep the `kodecupid-storage` disk attached (1 GB) — photos are stored on it under the `local`
   driver.

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

- [ ] `GET /api/v1/health` and `/api/v1/health/db` return `ok`
- [ ] Registration with a test number returns a challenge and the debug code banner appears
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
| Real SMS not arriving | `SMS_PROVIDER=twilio` plus all three Twilio variables, and the sender must be verified |
