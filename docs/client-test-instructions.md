# KodeCupid — Milestone 1 client test instructions

This build contains the full registration, onboarding, profile and admin foundation. Everything
below can be tested in a browser; no technical knowledge needed.

> **Local build (running on the development machine):**
> member app `http://localhost:3000` · admin `http://localhost:3000/admin/login` · API `http://localhost:4000/api/v1/health`
>
> **Staging URL:** `[add the deployed URL here once Vercel/Railway tokens are supplied]`
>
> **Support:** reply in the project thread with a screenshot and the phone number you used.

---

## 0. Before you start

- Use a phone-sized browser window or your phone — the app is built mobile-first.
- **Your own phone number** receives a real text message with a 6-digit code (valid 5 minutes).
- The **sample numbers** in section 1 are fictional, so they cannot receive texts. They accept a
  test code that we send you privately with your login details.
- For safety, you can request at most 3 codes per number every 15 minutes, and a code allows 5
  tries.

---

## 1. Register with a phone number

1. Open the staging URL and tap **Create your profile**.
2. Pick your country, then type **your own mobile number** (recommended for a brand-new account),
   or one of the sample numbers below:
   — `+880 1711 000001` — Ayesha (complete profile, 2 photos)
   — `+1 415 555 0101` — Marcus (complete profile)
   — `+1 415 555 0102` — Sofia (complete profile)
   — `+1 415 555 0103` — Dev (**paused** profile)
   — `+1 415 555 0104` — Nora (mixed privacy settings)

3. Tap **Send my code**. Type the code from the text message (or, for a sample number, the
   private test code).
4. Tap **Verify and continue**.

**Expected:** you land on a “Before we start” screen. You cannot reach the profile yet — that is
the compliance gate working.

## 2. Age gate and terms (blocking checks)

1. Enter a date of birth that makes you **17 years old** and accept all three statements.
2. Tap **Continue to setup**.

**Expected:** a red “KodeCupid is for adults only” screen. This account now stays blocked even if
you change the date — use a **different** number for the next step.
*(Enforced by the server, not just the screen.)*

3. Register with another number and enter a date of birth that makes you **18 or older**.

**Expected:** the setup wizard opens.

4. Try tapping **Continue to setup** without ticking the Terms, Guidelines or Safety Tips boxes.

**Expected:** an error message; you cannot continue. All three are mandatory, and the date,
version and IP of your acceptance are stored.

## 3. Guided onboarding

Work through the steps: Welcome → About you → Work & shifts → Location → What you want → Privacy.

While testing, check these specifically:

1. **Progress bar** at the top shows the step number and percentage.
2. On “About you”, leave the display name empty and press Continue.
   **Expected:** an inline error, and nothing is saved.
3. Fill in valid details, press Continue, then **press Back**.
   **Expected:** your answers are still there.
4. Close the tab in the middle of onboarding, then open the site again.
   **Expected:** you return to the step you were on — data is saved after every step.
5. On the Privacy step, switch one field off, then press **Finish setup**.
6. On the final screen press **Enter KodeCupid**.

**Expected:** you land on the member home page. Nothing errors, and all your data is present.

## 4. Profile and privacy toggles

1. Open **Profile** (bottom bar on mobile, top navigation on desktop).
2. Check that the fields you hid during onboarding show a **Private** label.
3. Tap **Edit profile**, add a bio and (optionally) upload 1–3 photos, then **Save profile**.
   **Expected:** “Profile saved.” and the new details appear on the profile screen.
4. Tap **Privacy**. Switch **Religion** on and off.

**Expected:** the caption changes between “Visible to members” and “Hidden from members”
immediately — there is no save button.
5. Go back to the profile screen and confirm the Religion row shows or hides the value.
6. In **Settings**, switch **Profile visible** off.

**Expected:** it changes to “Profile paused” and members can no longer see you. Switching it back
on resumes the profile.

7. In **Settings**, confirm your account status and the legal documents with their versions,
   then tap **Sign out**. Sign in again from **Log in** (wait one minute if you just requested a
   code). **Expected:** you go straight to the home screen and your profile is unchanged.

## 5. Admin — Super Admin

1. Open `/admin/login` (link also on the member sign-in page).
2. Sign in with the Super Admin account provided separately:
   - email and password: **provided privately in the handover message**
3. Check the left-hand menu. You should see: **Members, Roles & access, Verification, Complaints,
   Data deletion, Profile corrections, Settings, Monetization**.
4. Open **Members**: search for a name or phone number, filter by status, page through the list.
5. Open any member. Check that you can see the full phone number, the legal acceptance history and
   each profile field marked “Private” where the member hid it.
6. Try **Suspend**, then **Reactivate** the member. Try **Mark for deletion**.
   *(Do not press **Delete account** on the seeded profiles unless you are happy to lose one.)*
7. Open **Roles & access**: assign an email as **Moderator**, change a role with the dropdown, and
   revoke it. Note that the system refuses to remove the **last active Super Admin**.
8. Open **Activity log**: each role change you just made is listed with who did it and when.

## 6. Admin — Moderator (the permission difference)

1. Sign out of the admin area.
2. Sign in with the Moderator account:
   - email and password: **provided privately in the handover message**

Compare with the Super Admin session:

| Area | Super Admin | Moderator |
| --- | --- | --- |
| Members list | ✅ full phone numbers | ✅ **masked** phone numbers |
| Suspend / reactivate members | ✅ | ❌ not available |
| Delete a member account | ✅ | ❌ not available |
| Roles & access | ✅ | ❌ **not in the menu** |
| Settings / Monetization | ✅ | ❌ **not in the menu** |
| Verification, Complaints, Deletion, Corrections | ✅ | ✅ (queues arrive in Milestone 2) |

3. With the Moderator signed in, type the address `/admin/roles` directly into the browser.
   **Expected:** a clear “Role management is Super Admin only” screen — the server refuses it, not
   just the missing menu item.

## 7. What is intentionally not in Milestone 1

Discovery/browsing and matching, messaging, payments, provider verification document review,
admin two-factor authentication and the full complaint workflow are scheduled for later
milestones. The queues you can see in the admin menu are permission-gated placeholders marked
**M2**.

## 8. If something looks wrong

Please send:

- the screen (screenshot) and the exact step number from this document
- the phone number or admin email you used
- the time it happened (so we can match server logs)
