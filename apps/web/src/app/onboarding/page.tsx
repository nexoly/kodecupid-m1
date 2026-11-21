'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/app/providers';
import { Spinner } from '@/components/ui/feedback';
import { routeAfterAuth } from '@/lib/routing';

/** `/onboarding` resumes the member at their saved step (or wherever they belong). */
export default function OnboardingEntryPage() {
  const { member, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (member) {
      routeAfterAuth(member, router);
    } else {
      router.replace('/login?next=/onboarding');
    }
  }, [loading, member, router]);

  return (
    <div className="flex min-h-[50dvh] items-center justify-center" aria-busy="true">
      <Spinner label="Loading your setup" />
    </div>
  );
}
