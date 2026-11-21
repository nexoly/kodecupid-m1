import { expect, test, type Page } from '@playwright/test';

/**
 * Milestone 1 final acceptance, run on a 360px phone viewport:
 * onboarding back/resume, profile editing, privacy enforced by the API (not
 * just hidden in the UI), pause/resume, sign out → sign in with persistence,
 * and role assignment by email with an audit entry.
 */
const DEBUG_CODE = process.env.OTP_DEBUG_CODE ?? '246810';
const PHOTO_FIXTURE = 'public/icon-192.png';

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

function randomNationalNumber(): string {
  return `17${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

async function signInWithPhone(page: Page, path: '/register' | '/login', phone: string) {
  await page.goto(path);
  await page.getByLabel('Country').selectOption('BD');
  await page.getByLabel('Phone number').fill(phone);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: /Send (my|sign-in) code/ }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel('Verification code').fill(DEBUG_CODE);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
}

test('member journey: onboarding resume, profile edit, API-enforced privacy, pause, re-login', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${message.text()} @ ${message.location().url}`);
  });

  const phone = randomNationalNumber();
  await signInWithPhone(page, '/register', phone);

  // Terms + age gate
  await expect(page).toHaveURL(/\/compliance/);
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Date of birth').fill('1992-03-14');
  await page.getByLabel(/I confirm that I am/).check();
  await page.getByLabel(/I accept the Terms of Service/).check();
  await page.getByLabel(/I accept the Community Guidelines/).check();
  await page.getByLabel(/I accept the Safety Tips/).check();
  await page.getByRole('button', { name: 'Continue to setup' }).click();

  // Onboarding: step 1 → 2 → back → data kept
  await expect(page).toHaveURL(/\/onboarding\/welcome/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity/);
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Display name').fill('Acceptance Medic');
  await page.getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByRole('button', { name: 'Women', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/onboarding\/profession/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity/);
  await expect(page.getByLabel('Display name')).toHaveValue('Acceptance Medic');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/onboarding\/profession/);
  await page.getByRole('button', { name: 'EMS', exact: true }).click();
  await page.getByLabel('Job title').fill('Paramedic');
  await page.getByRole('button', { name: 'Night shift' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/location/);

  // Leave mid-way and come back: the member resumes at the saved step
  await page.goto('/app');
  await expect(page).toHaveURL(/\/onboarding\/location/);

  await page.getByLabel('City').fill('Charlotte');
  await page.getByLabel('State / province').fill('North Carolina');
  await page.getByLabel('Country').selectOption('US');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/preferences/);
  await page.getByRole('button', { name: 'Long-term relationship' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/privacy/);
  await page.getByRole('button', { name: 'Continue to finish' }).click();

  await expect(page).toHaveURL(/\/onboarding\/complete/);
  await page.locator('input[type="file"]').setInputFiles(PHOTO_FIXTURE);
  await page.getByRole('button', { name: 'Enter KodeCupid' }).click();
  await expect(page).toHaveURL(/\/app/);
  await expectNoHorizontalScroll(page);

  // Edit profile fields
  await page.goto('/profile/edit');
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Bio').fill('Night-shift paramedic who loves sunrise hikes.');
  await page.getByLabel('Religion').fill('Buddhist');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  const me = await (await page.request.get('/api/v1/profile/me')).json();
  expect(me.bio).toBe('Night-shift paramedic who loves sunrise hikes.');
  expect(me.age).toBeGreaterThanOrEqual(18);
  const profileId: string = me.id;

  // Privacy is enforced by the API: religion starts hidden → absent from the public payload
  let publicView = await (await page.request.get(`/api/v1/profiles/${profileId}`)).json();
  expect(publicView.religion).toBeUndefined();
  expect(publicView.hiddenFields).toContain('RELIGION');
  expect(publicView.latitude).toBeUndefined();
  expect(publicView.dateOfBirth).toBeUndefined();
  expect(JSON.stringify(publicView)).not.toContain(phone);

  await page.goto('/profile/privacy');
  await expectNoHorizontalScroll(page);
  await page.getByRole('switch', { name: 'Religion' }).click();
  await expect(page.getByText(/Religion is now visible/)).toBeVisible();
  publicView = await (await page.request.get(`/api/v1/profiles/${profileId}`)).json();
  expect(publicView.religion).toBe('Buddhist');

  await page.getByRole('switch', { name: 'Religion' }).click();
  await expect(page.getByText(/Religion is now hidden/)).toBeVisible();
  publicView = await (await page.request.get(`/api/v1/profiles/${profileId}`)).json();
  expect(publicView.religion).toBeUndefined();

  // Pause and resume from Settings
  await page.goto('/settings');
  await expectNoHorizontalScroll(page);
  await expect(page.getByText('Safety Tips')).toBeVisible();
  await page.getByRole('switch', { name: /Profile visible/ }).click();
  await expect(page.getByRole('switch', { name: /Profile paused/ })).toBeVisible();
  const paused = await page.request.get(`/api/v1/profiles/${profileId}`);
  expect(paused.status()).toBe(403);
  expect((await paused.json()).error.code).toBe('PROFILE_PAUSED');

  await page.getByRole('switch', { name: /Profile paused/ }).click();
  await expect(page.getByRole('switch', { name: /Profile visible/ })).toBeVisible();
  expect((await page.request.get(`/api/v1/profiles/${profileId}`)).status()).toBe(200);

  // Sign out → protected pages redirect → sign back in → data persisted
  await page.locator('#main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/v1/profile/me')).status()).toBe(401);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);

  // A new code can be requested 60s after the previous one (anti-abuse cooldown).
  await page.waitForTimeout(61_000);
  await signInWithPhone(page, '/login', phone);
  await expect(page).toHaveURL(/\/app/);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Acceptance Medic' })).toBeVisible();
  await expect(page.getByText('Night-shift paramedic who loves sunrise hikes.')).toBeVisible();

  const status = await (await page.request.get('/api/v1/onboarding/status')).json();
  expect(JSON.stringify(status)).toMatch(/"completed(At)?":\s*(true|")/);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('super admin assigns a moderator by email; the change is audited', async ({ page }) => {
  const email = `qa.moderator.${Date.now()}@kodecupid.test`;

  await page.goto('/admin/login');
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Work email').fill(process.env.SEED_ADMIN_EMAIL ?? 'admin@kodecupid.test');
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin1');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/admin\/users/);

  await page.goto('/admin/users');
  await expectNoHorizontalScroll(page);
  const firstMember = page.locator('a[href^="/admin/users/"]:visible').first();
  await expect(firstMember).toBeVisible();
  await firstMember.click();
  await expect(page).toHaveURL(/\/admin\/users\/.+/);

  await page.goto('/admin/roles');
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption('MODERATOR');
  await page.getByRole('button', { name: 'Assign role' }).click();
  await expect(page.getByText(email).first()).toBeVisible();

  const audit = await (await page.request.get('/api/v1/admin/audit-logs')).json();
  expect(audit.some((row: { action: string }) => row.action === 'role.assigned')).toBe(true);

  await page.goto('/admin/audit');
  await expectNoHorizontalScroll(page);
});
