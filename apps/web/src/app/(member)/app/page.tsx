'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  RELATIONSHIP_GOAL_LABELS,
  SHIFT_SCHEDULE_LABELS,
  type ProfileOwnerView,
} from '@kodecupid/shared';
import { useSession } from '@/app/providers';
import { apiFetch, errorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Alert, Badge, LoadingBlock } from '@/components/ui/feedback';
import { CompletionRing } from '@/components/profile/fields';
import { Button } from '@/components/ui/button';

export default function MemberHomePage() {
  const { member } = useSession();
  const [profile, setProfile] = useState<ProfileOwnerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ProfileOwnerView>('/profile/me')
      .then((value) => {
        if (!cancelled) setProfile(value);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught, 'Could not load your profile.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingBlock label="Loading your home" rows={3} />;
  }

  if (error) {
    return <Alert tone="danger">{error}</Alert>;
  }

  const firstName = profile?.displayName?.split(' ')[0] ?? 'there';
  const shift = profile?.shiftSchedule
    ? SHIFT_SCHEDULE_LABELS[profile.shiftSchedule]
    : 'your shift';
  const goals = (profile?.relationshipGoals ?? [])
    .map((goal) => RELATIONSHIP_GOAL_LABELS[goal])
    .join(', ');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Signed in as {member?.user.phone}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
          Hi {firstName} 👋
        </h1>
        <p className="text-sm text-muted">
          Your profile is set to <span className="font-medium text-charcoal">{shift}</span>
          {goals ? ` · open to ${goals.toLowerCase()}` : ''}.
        </p>
      </div>

      {member?.user.profileStatus === 'PAUSED' ? (
        <Alert tone="warning" title="Your profile is paused">
          Other members cannot see you right now. Resume whenever you are ready.
        </Alert>
      ) : null}

      <Card className="flex items-center gap-4">
        <CompletionRing percent={profile?.completionPercent ?? 0} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">
            {profile?.displayName ?? 'Add your display name'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {[profile?.city, profile?.profession].filter(Boolean).join(' · ') ||
              'Add a city and profession to stand out'}
          </p>
        </div>
        <Link href="/profile/edit">
          <Button size="sm" variant="ghost">
            Improve
          </Button>
        </Link>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/profile" className="block">
          <Card className="h-full transition-colors hover:border-crimson/30">
            <p className="text-sm font-semibold text-navy">My profile</p>
            <p className="mt-1 text-xs text-muted">Photos, bio and the details you share.</p>
          </Card>
        </Link>
        <Link href="/profile/privacy" className="block">
          <Card className="h-full transition-colors hover:border-crimson/30">
            <p className="text-sm font-semibold text-navy">Privacy controls</p>
            <p className="mt-1 text-xs text-muted">
              Twenty fields, each with its own show / hide switch.
            </p>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy">Discovery is next</p>
            <p className="mt-1 text-xs text-muted">
              Browse and matching arrive in Milestone 2. For now, your profile is ready and
              reviewable in the admin area.
            </p>
          </div>
          <Badge tone="neutral">M2</Badge>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-navy">Your safety basics</p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted">
          <li>· Your phone number and date of birth are never shown to members.</li>
          <li>· Hidden fields show a “Private” badge instead of a value.</li>
          <li>· Use Settings → Pause profile whenever you need a break.</li>
        </ul>
      </Card>
    </div>
  );
}
