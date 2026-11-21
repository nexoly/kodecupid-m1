'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/app/providers';
import { routeAfterAuth } from '@/lib/routing';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/app', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z' },
  {
    href: '/profile',
    label: 'Profile',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0Z',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm8-4.2v1.4l2 1.6-2 3.4-2.4-.8a7.7 7.7 0 0 1-1.2.7l-.4 2.5h-4l-.4-2.5a7.7 7.7 0 0 1-1.2-.7L6 18l-2-3.4 2-1.6v-1.4l-2-1.6 2-3.4 2.4.8c.4-.3.8-.5 1.2-.7l.4-2.5h4l.4 2.5c.4.2.8.4 1.2.7l2.4-.8 2 3.4Z',
  },
];

export function MemberShell({ children }: { children: React.ReactNode }) {
  const { member, loading, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // Members who have not accepted the terms or finished onboarding are sent
  // back to where they left off (the API enforces compliance independently).
  const gated = !!member && (member.compliance.required || !member.onboarding.completed);
  useEffect(() => {
    if (!loading && member && gated) {
      routeAfterAuth(member, router);
    }
  }, [gated, loading, member, router]);

  if (gated) {
    return <div className="min-h-dvh bg-alabaster" aria-busy="true" />;
  }

  const displayName = member?.user.displayName ?? 'Your profile';

  return (
    <div className="min-h-dvh bg-alabaster">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo href="/app" size="sm" />
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-navy text-white' : 'text-charcoal hover:bg-alabaster',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted md:inline">{displayName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pb-12">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
                    active ? 'text-crimson' : 'text-muted',
                  ].join(' ')}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
