# API reference (Milestone 1)

Base URL: `{PUBLIC_API_URL}/api/v1`. All responses are JSON. Errors use one envelope:

```json
{ "error": { "code": "AGE_RESTRICTED", "message": "KodeCupid is only available to people aged 18 and over.", "details": { "minimumAge": 18 } } }
```

## Authentication model

| Audience | Endpoint group | Cookie | JWT audience |
| --- | --- | --- | --- |
| Member | `/auth/*` | `kc_at` (15 min) + `kc_rt` (30 days) | `kodecupid:member` |
| Admin | `/admin/auth/*` | `kc_admin_at` + `kc_admin_rt` | `kodecupid:admin` |

- Cookies are `httpOnly`, `SameSite=Lax`, `Secure` outside development, and scoped to the API prefix.
- Refresh tokens rotate on every use; reuse of a rotated token revokes every session for that account.
- A member access token can never open an admin route (separate audience and separate table).
- `Authorization: Bearer <access token>` is also accepted, which is handy for automated tests.

## Public

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | readiness: `{ status, database: "connected", postgis: "enabled" }`; 503 with the same shape if either fails |
| GET | `/health/db` | alias of `/health` |
| GET | `/meta` | app name, legal versions, `debugOtpEnabled`, `smsProvider` |
| GET | `/compliance/documents` | current legal documents + versions |
| GET | `/files/:key` | locally stored photo (unguessable key) |
| POST | `/auth/request-otp` (alias `/auth/otp/request`) | send a 6-digit code: `phone` as full E.164 (`+1404…`), or national number + `countryCode`. Max 3 per number per 15 min |
| POST | `/auth/otp/verify` | verify code (`challengeId`, `code`) → sets cookies |
| POST | `/auth/refresh` | rotate refresh token |
| POST | `/auth/logout` | revoke the session |
| POST | `/admin/auth/login` | admin email + password |
| POST | `/admin/auth/accept-invite` | accept an invitation (`token`, `name`, `password`) |

## Member (session required)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/auth/me` | user + compliance + onboarding status |
| POST | `/compliance/accept` | DOB + 18+ + Terms + Guidelines; returns `AGE_RESTRICTED` for minors |
| GET | `/onboarding/state` | completed steps + next step (resume support) |
| PATCH | `/onboarding/steps/:step` | one of `welcome, identity, profession, location, preferences, privacy` |
| POST | `/onboarding/complete` | requires every step to be saved first |
| GET | `/profile/me` | owner view (all fields + visibility map + completion) |
| PATCH | `/profile/me` | partial update; changing DOB re-runs the 18+ check |
| PUT | `/profile/me/visibility` | `{ field, visibility: PUBLIC \| HIDDEN }` |
| POST | `/profile/me/pause` / `/resume` | hides the profile from other members |
| POST | `/profile/me/photos` | multipart `file`; JPEG/PNG/WebP ≤ 4 MB, max 6 photos |
| DELETE | `/profile/me/photos/:id` | removes the photo and promotes the next one |
| PATCH | `/profile/me/photos/order` | `{ photoIds: string[] }`, first becomes primary |
| GET | `/profiles/:id` | member-facing view, filtered by the owner's privacy toggles |

`/profile/*`, `/onboarding/*` and `/profiles/:id` require a completed compliance gate; otherwise
they answer `403 COMPLIANCE_REQUIRED`.

## Admin (admin session + permission required)

Every admin route is protected by `AdminAuthGuard` **and** `PermissionsGuard`. A route without an
explicit permission declaration fails closed with `403 PERMISSION_DENIED`.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/auth/me` | any active admin |
| GET | `/admin/users` | `users.read` |
| GET | `/admin/users/:id` | `users.read` |
| PATCH | `/admin/users/:id/status` | `users.write` |
| DELETE | `/admin/users/:id` | `users.delete` (Super Admin only) |
| GET | `/admin/admins` | `admins.read` |
| POST | `/admin/admins/invite` | `admins.manage` |
| PATCH | `/admin/admins/:id/role` | `admins.manage` |
| PATCH | `/admin/admins/:id/status` | `admins.manage` |
| DELETE | `/admin/admins/invitations/:id` | `admins.manage` |
| GET | `/admin/verification` | `verification.read` |
| GET | `/admin/complaints` | `complaints.read` |
| GET | `/admin/deletion-requests` | `deletion.read` |
| GET | `/admin/corrections` | `corrections.read` |
| GET | `/admin/settings` | `settings.read` (Super Admin only) |
| GET | `/admin/monetization` | `monetization.read` (Super Admin only) |
| GET | `/admin/audit` | `audit.read` (Super Admin only) |

Role rules: at least one active `SUPER_ADMIN` must always remain; an admin cannot disable their own
account. Both refusals return `409 LAST_SUPER_ADMIN`.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | body/query failed the shared zod schema (`details.fieldErrors`) |
| `UNAUTHENTICATED` / `SESSION_EXPIRED` | 401 | sign in again |
| `AGE_RESTRICTED` | 403 | date of birth is under 18 |
| `COMPLIANCE_REQUIRED` | 403 | age gate or legal acceptance not completed |
| `ACCOUNT_SUSPENDED` | 403 | account suspended by an admin |
| `PERMISSION_DENIED` | 403 | role lacks the permission (or route declares none) |
| `PROFILE_PAUSED` | 403 | the owner paused their profile |
| `ONBOARDING_INCOMPLETE` | 403 | `details.missing` lists unfinished steps |
| `OTP_INVALID` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` | 400/429 | code problems |
| `OTP_RESEND_TOO_SOON` / `RATE_LIMITED` | 429 | `details.retryAfterSeconds` |
| `PROFILE_NOT_FOUND` / `NOT_FOUND` | 404 | object does not exist or is not visible |
| `CONFLICT` / `LAST_SUPER_ADMIN` / `INVITATION_INVALID` | 409 | state conflict |
| `PHOTO_LIMIT_REACHED` / `PHOTO_INVALID` | 400 | upload rejected |
