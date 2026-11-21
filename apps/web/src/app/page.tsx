import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

const FEATURES = [
  {
    title: 'Built around your shift',
    body: 'Match on day, night and rotating schedules so you are not planning a date you will have to cancel.',
    accent: 'bg-crimson-soft text-crimson',
  },
  {
    title: 'Privacy you actually control',
    body: 'Every field has its own switch — hide your workplace, religion or exact area and show only what you want.',
    accent: 'bg-navy/10 text-navy',
  },
  {
    title: 'Verified, adult members',
    body: 'Phone verification, a real age gate and mandatory community guidelines keep the community accountable.',
    // Verification-related: the one place Service Gold belongs on this page.
    accent: 'bg-gold-soft text-navy',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-alabaster">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-navy hover:bg-white"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-dark"
          >
            Join free
          </Link>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-crimson">
                For shift workers
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-navy sm:text-6xl">
                Dating that fits <span className="text-crimson">your hours.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-charcoal sm:text-lg">
                Nurses, doctors, paramedics and everyone who works while the world sleeps. KodeCupid
                matches you on the schedule you actually live, with privacy controls for everything
                personal.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-crimson px-7 text-base font-semibold text-white shadow-sm hover:bg-crimson-dark"
                >
                  Create your profile
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-white px-7 text-base font-semibold text-navy hover:border-navy/30"
                >
                  I already have an account
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted">
                18+ only · Phone verified · Community guidelines enforced
              </p>
            </div>

            <Card className="relative overflow-hidden bg-navy p-0 text-white">
              <div className="absolute -right-16 -top-16 size-56 rounded-full bg-crimson/40 blur-3xl" />
              <div className="relative space-y-4 p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                  Tonight&apos;s shift
                </p>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-full bg-white/20 text-lg font-semibold text-white">
                      AR
                    </span>
                    <div>
                      <p className="font-semibold">Ayesha, 29</p>
                      <p className="text-sm text-white/70">Registered Nurse · Night shift</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {['Dhaka', 'Bengali · English', 'Long-term'].map((chip) => (
                      <span key={chip} className="rounded-full bg-white/15 px-2.5 py-1">
                        {chip}
                      </span>
                    ))}
                    <span className="rounded-full border border-white/40 px-2.5 py-1 text-white/80">
                      Religion hidden
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-white/60">Schedules in common</p>
                    <p className="mt-1 text-lg font-semibold">Night · Rotating</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-white/60">Privacy toggles</p>
                    <p className="mt-1 text-lg font-semibold">20 fields</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <span
                  className={`mb-4 inline-flex size-10 items-center justify-center rounded-xl ${feature.accent}`}
                  aria-hidden
                >
                  ✦
                </span>
                <h2 className="text-lg font-semibold text-navy">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-card bg-crimson px-6 py-10 text-center text-white sm:px-12">
            <h2 className="text-2xl font-semibold sm:text-3xl">Your next date should not need a shift swap.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/85">
              Join in under two minutes with your phone number. No social media required, no photos
              public until you choose.
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-base font-semibold text-crimson hover:bg-alabaster"
              >
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} KodeCupid. Adults only (18+).</p>
          <p>Milestone 1 preview build.</p>
        </div>
      </footer>
    </div>
  );
}
