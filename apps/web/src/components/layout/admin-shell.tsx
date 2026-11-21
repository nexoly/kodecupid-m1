'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_NAV, ADMIN_ROLE_LABELS, can, type AdminRole } from '@kodecupid/shared';
import { useSession } from '@/app/providers';
import { Logo } from '@/components/brand/logo';
import { LoadingBlock } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';

/**
 * Navigation is derived from the same permission matrix the API enforces, so a
 * Moderator simply never receives links they would be refused on.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, adminLogout, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (loading && !admin) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <LoadingBlock label="Loading admin area" rows={4} />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="mx-auto max-w-md p-6">
        <LoadingBlock label="Redirecting to sign in" rows={1} />
      </div>
    );
  }

  const role = admin.admin.role as AdminRole;
  const items = ADMIN_NAV.filter((item) => can(role, item.permission));

  return (
    <div className="min-h-dvh bg-alabaster">
      <header className="border-b border-line bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider">
              Admin
            </span>
            <Logo href="/admin/users" size="sm" onDark />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/70 sm:inline">{admin.admin.email}</span>
            <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white">
              {ADMIN_ROLE_LABELS[role]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="border-white/25 text-white hover:bg-white/10"
              onClick={async () => {
                await adminLogout();
                router.replace('/admin/login');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav aria-label="Admin sections" className="lg:w-64 lg:shrink-0">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.key} className="shrink-0 lg:w-full">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-navy bg-navy text-white'
                        : 'border-line bg-white text-charcoal hover:border-navy/25',
                    ].join(' ')}
                  >
                    <span>{item.label}</span>
                    {item.milestone === 2 ? (
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                          active ? 'bg-white/15 text-white' : 'bg-alabaster text-muted',
                        ].join(' ')}
                      >
                        M2
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
