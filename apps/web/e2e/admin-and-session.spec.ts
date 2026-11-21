import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Admin chain from the brief: Super Admin → Users → assign a role by email →
 * that person activates the invitation → signs in as Moderator → permission
 * checks → Super Admin revokes → access ends immediately. Plus session
 * refresh, the brief's route names and pause on the privacy page.
 */
const DEBUG_CODE = process.env.OTP_DEBUG_CODE ?? '246810';
const SUPER_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@kodecupid.test';
const SUPER_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin1';
const SEEDED_MEMBER = '4155550101'; // Marcus (seeded, onboarding complete)

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

async function adminSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
}

async function newMobilePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    isMobile: true,
    hasTouch: true,
  });
  return context.newPage();
}

test('admin chain: assign by email → moderator signs in → permissions → revoke', async ({
  page,
  browser,
}) => {
  const email = `qa.mod.${Date.now()}@kodecupid.test`;
  const password = 'Moderator2026pass';

  // Super Admin: users list, a member's detail page, then assign a role by email
  await adminSignIn(page, SUPER_EMAIL, SUPER_PASSWORD);
  await noHorizontalScroll(page);
  const member = page.locator('a[href^="/admin/users/"]:visible').first();
  await member.click();
  await expect(page).toHaveURL(/\/admin\/users\/.+/);
  await noHorizontalScroll(page);

  await page.goto('/admin/roles');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption('MODERATOR');
  await page.getByRole('button', { name: 'Assign role' }).click();
  const inviteCode = page.locator('code').filter({ hasText: 'accept-invite' });
  await expect(inviteCode).toBeVisible();
  const inviteUrl = (await inviteCode.innerText()).trim();

  // The invitee activates the account in their own browser
  const invitee = await newMobilePage(browser);
  await invitee.goto(inviteUrl);
  await invitee.getByLabel('Full name').fill('QA Moderator');
  await invitee.getByLabel('Password', { exact: true }).fill(password);
  await invitee.getByLabel('Confirm password').fill(password);
  await invitee.getByRole('button', { name: 'Activate account' }).click();
  await expect(invitee.getByRole('heading', { name: /You.re set up/ })).toBeVisible();

  // ...and signs in as a Moderator
  await adminSignIn(invitee, email, password);
  await noHorizontalScroll(invitee);
  for (const allowed of ['Members', 'Verification', 'Complaints', 'Data deletion', 'Profile corrections']) {
    await expect(invitee.getByRole('link', { name: allowed }).first()).toBeVisible();
  }
  for (const hidden of ['Roles & access', 'Monetization', 'Settings', 'Activity log']) {
    await expect(invitee.getByRole('link', { name: hidden })).toHaveCount(0);
  }

  await invitee.goto('/admin/verification');
  await expect(invitee.getByRole('heading', { name: /Verification/ }).first()).toBeVisible();

  // Typing restricted addresses directly is refused by the server, not just hidden
  await invitee.goto('/admin/roles');
  await expect(invitee.getByText('Role management is Super Admin only')).toBeVisible();
  await invitee.goto('/admin/monetization');
  await expect(invitee.getByText('Not available for your role')).toBeVisible();
  await invitee.goto('/admin/settings');
  await expect(invitee.getByText('Not available for your role')).toBeVisible();

  const assign = await invitee.request.post('/api/v1/admin/roles/assign', {
    data: { email: 'someone@kodecupid.test', role: 'SUPER_ADMIN' },
  });
  expect(assign.status()).toBe(403);
  expect((await invitee.request.get('/api/v1/admin/monetization')).status()).toBe(403);
  expect((await invitee.request.get('/api/v1/admin/audit-logs')).status()).toBe(403);
  expect((await invitee.request.get('/api/v1/admin/users')).status()).toBe(200);

  // Super Admin revokes; the change takes effect on the moderator's next request
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/admin/roles');
  const row = page.locator('li, tr, div').filter({ hasText: email }).filter({
    has: page.getByRole('button', { name: 'Revoke' }),
  });
  await row.last().getByRole('button', { name: 'Revoke' }).click();
  await expect
    .poll(async () => (await invitee.request.get('/api/v1/admin/users')).status())
    .not.toBe(200);

  // Every change is in the audit log
  const audit = (await (await page.request.get('/api/v1/admin/audit-logs')).json()) as {
    action: string;
  }[];
  const actions = audit.map((entry) => entry.action);
  expect(actions).toContain('role.assigned');
  expect(actions).toContain('role.revoked');

  await invitee.context().close();
});

test('member session survives access-token expiry and the brief route names work', async ({
  page,
  context,
}) => {
  // /verify-otp maps onto the OTP screen
  await page.goto('/verify-otp');
  await expect(page).toHaveURL(/\/(verify|register|login)/);

  await page.goto('/login');
  await page.getByLabel('Country').selectOption('US');
  await page.getByLabel('Phone number').fill(SEEDED_MEMBER);
  await page.getByRole('button', { name: /Send (my|sign-in) code/ }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel('Verification code').fill(DEBUG_CODE);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/app$/); // onboarding already complete

  // Simulate the 15-minute access token expiring: drop it, keep the 30-day session
  await context.clearCookies({ name: 'kc_at' });
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: /Marcus/ })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === 'kc_at')).toBe(true); // refreshed

  // Pause and resume from the privacy page
  await page.goto('/profile/privacy');
  await noHorizontalScroll(page);
  await page.getByRole('switch', { name: /Profile visible/ }).click();
  await expect(page.getByText('Your profile is paused.')).toBeVisible();
  const me = await (await page.request.get('/api/v1/profile/me')).json();
  expect(me.status).toBe('PAUSED');
  expect((await page.request.get(`/api/v1/profiles/${me.id}`)).status()).toBe(403);
  await page.getByRole('switch', { name: /Profile paused/ }).click();
  await expect(page.getByText('Your profile is visible again.')).toBeVisible();
  expect((await page.request.get(`/api/v1/profiles/${me.id}`)).status()).toBe(200);
});

test('admin session survives access-token expiry', async ({ page, context }) => {
  await adminSignIn(page, SUPER_EMAIL, SUPER_PASSWORD);
  await context.clearCookies({ name: 'kc_admin_at' });
  await page.goto('/admin/audit');
  await expect(page).toHaveURL(/\/admin\/audit/);
  await expect(page.getByRole('heading', { name: /Activity log/ })).toBeVisible();
});
