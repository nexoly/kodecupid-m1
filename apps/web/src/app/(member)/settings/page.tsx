'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MetaInfo, ProfileOwnerView } from '@kodecupid/shared';
import { useSession } from '@/app/providers';
import { apiFetch, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Alert, Badge, LoadingBlock } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleRow } from '@/components/ui/toggle';

export default function SettingsPage() {
  const router = useRouter();
  const { member, logout } = useSession();
  const [profile, setProfile] = useState<ProfileOwnerView | null>(null);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<ProfileOwnerView>('/profile/me'),
      apiFetch<MetaInfo>('/meta'),
    ])
      .then(([profileValue, metaValue]) => {
        if (cancelled) return;
        setProfile(profileValue);
        setMeta(metaValue);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught, 'Could not load your settings.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePause(nextPaused: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<ProfileOwnerView>(
        nextPaused ? '/profile/pause' : '/profile/resume',
        { method: 'PATCH' },
      );
      setProfile(updated);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update your profile status.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading settings" rows={3} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your account, visibility and legal records.</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">Account</h2>
        <dl className="mt-2 divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Phone number</dt>
            <dd className="font-medium text-navy">{member?.user.phone ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Member since</dt>
            <dd className="font-medium text-navy">{formatDate(member?.user.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Account status</dt>
            <dd>
              <Badge tone={member?.user.status === 'ACTIVE' ? 'success' : 'warning'}>
                {member?.user.status?.replace(/_/g, ' ').toLowerCase() ?? '—'}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Age check</dt>
            <dd className="font-medium text-navy">
              {member?.user.ageVerifiedAt ? 'Verified 18+' : 'Not verified'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">Profile visibility</h2>
        <p className="mt-0.5 text-xs text-muted">
          Pausing hides you from other members without deleting anything.
        </p>
        <div className="mt-2">
          <ToggleRow
            id="pause-profile"
            checked={profile?.status !== 'PAUSED'}
            disabled={busy}
            onChange={(value) => void togglePause(!value)}
            title={profile?.status === 'PAUSED' ? 'Profile paused' : 'Profile visible'}
            description={
              profile?.status === 'PAUSED'
                ? 'Nobody can see your profile. Switch on to resume.'
                : 'Members can see the fields you have not hidden.'
            }
          />
        </div>
        <div className="mt-2">
          <Link href="/profile/privacy" className="text-sm font-semibold text-crimson underline">
            Manage individual field privacy
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">Legal</h2>
        <dl className="mt-2 divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Terms of Service</dt>
            <dd className="font-medium text-navy">v{meta?.legalVersions.terms ?? '—'} accepted</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Community Guidelines</dt>
            <dd className="font-medium text-navy">v{meta?.legalVersions.guidelines ?? '—'} accepted</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Safety Tips</dt>
            <dd className="font-medium text-navy">v{meta?.legalVersions.safetyTips ?? '—'} accepted</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted">Privacy Policy</dt>
            <dd className="font-medium text-navy">v{meta?.legalVersions.privacy ?? '—'}</dd>
          </div>
        </dl>
        {meta?.debugOtpEnabled ? (
          <p className="mt-2 text-xs text-muted">
            This environment uses a test verification code ({meta.smsProvider} SMS provider).
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">Session</h2>
        <p className="mt-1 text-xs text-muted">
          Signing out ends this session on this device. Your profile stays as it is.
        </p>
        <div className="mt-3">
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
