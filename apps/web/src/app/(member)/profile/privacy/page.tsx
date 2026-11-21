'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_VALUES,
  type ProfileField,
  type ProfileOwnerView,
} from '@kodecupid/shared';
import { apiFetch, errorMessage } from '@/lib/api';
import { Alert, Badge, LoadingBlock } from '@/components/ui/feedback';
import { Card } from '@/components/ui/card';
import { ToggleRow } from '@/components/ui/toggle';

const GROUPS: { title: string; description: string; fields: ProfileField[] }[] = [
  {
    title: 'Identity',
    description: 'Name, age and who you are interested in',
    fields: ['DISPLAY_NAME', 'AGE', 'GENDER_IDENTITY', 'INTERESTED_IN'],
  },
  {
    title: 'Location & work',
    description: 'What could be used to find you offline',
    fields: ['LOCATION', 'PROFESSION', 'SHIFT_SCHEDULE', 'WORKPLACE'],
  },
  {
    title: 'Background',
    description: 'Details that can be sensitive to share',
    fields: ['RELIGION', 'ETHNICITY', 'LANGUAGES', 'HEIGHT', 'EDUCATION', 'CREDENTIALS'],
  },
  {
    title: 'Lifestyle',
    description: 'Drinking, smoking, cannabis and exercise',
    fields: ['LIFESTYLE'],
  },
  {
    title: 'What you are looking for',
    description: 'Intent and family plans',
    fields: ['RELATIONSHIP_GOALS', 'FAMILY_PLANS', 'KIDS'],
  },
  {
    title: 'Media & writing',
    description: 'Your bio and photos',
    fields: ['BIO', 'PHOTOS'],
  },
];

export default function PrivacyPage() {
  const [profile, setProfile] = useState<ProfileOwnerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<ProfileField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  // Both mutations return a full profile snapshot, so only one can run at a time.
  const saving = useRef(false);
  const controlsDisabled = pausing || savingField !== null;

  useEffect(() => {
    let cancelled = false;
    apiFetch<ProfileOwnerView>('/profile/me')
      .then((value) => {
        if (!cancelled) setProfile(value);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught, 'Could not load your privacy settings.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setVisibility(field: ProfileField, makePublic: boolean): Promise<void> {
    if (saving.current) return;
    saving.current = true;
    setSavingField(field);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<ProfileOwnerView>('/profile/privacy', {
        method: 'PATCH',
        body: { field, visibility: makePublic ? 'PUBLIC' : 'HIDDEN' },
      });
      setProfile(updated);
      setNotice(`${PROFILE_FIELD_LABELS[field]} is now ${makePublic ? 'visible' : 'hidden'}.`);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not change that setting.'));
    } finally {
      saving.current = false;
      setSavingField(null);
    }
  }

  async function setPaused(nextPaused: boolean): Promise<void> {
    if (saving.current) return;
    saving.current = true;
    setPausing(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<ProfileOwnerView>(
        nextPaused ? '/profile/pause' : '/profile/resume',
        { method: 'PATCH' },
      );
      setProfile(updated);
      setNotice(
        nextPaused
          ? 'Your profile is paused. Other members cannot see it.'
          : 'Your profile is visible again.',
      );
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update your profile status.'));
    } finally {
      saving.current = false;
      setPausing(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading privacy settings" rows={4} />;
  }

  if (!profile) {
    return <Alert tone="danger">{error ?? 'Your profile could not be loaded.'}</Alert>;
  }

  const hiddenCount = PROFILE_FIELD_VALUES.filter(
    (field) => profile.visibility[field] === 'HIDDEN',
  ).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Privacy controls</h1>
        <p className="mt-1 text-sm text-muted">
          Switch any field off and other members see a “Private” badge instead of the value. Your
          phone number, date of birth and exact coordinates are never shown to anyone.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">
          Profile visibility
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Pausing hides your whole profile from other members without deleting anything.
        </p>
        <div className="mt-2">
          <ToggleRow
            id="pause-profile"
            checked={profile.status !== 'PAUSED'}
            disabled={controlsDisabled}
            onChange={(visible) => void setPaused(!visible)}
            title={profile.status === 'PAUSED' ? 'Profile paused' : 'Profile visible'}
            description={
              pausing
                ? 'Saving…'
                : profile.status === 'PAUSED'
                  ? 'Nobody can see your profile. Switch on to resume.'
                  : 'Members can see the fields you have not hidden.'
            }
          />
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy">
            {hiddenCount} of {PROFILE_FIELD_VALUES.length} fields hidden
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Changes save immediately — there is no separate save button.
          </p>
        </div>
        <Badge tone={hiddenCount > 0 ? 'navy' : 'success'}>
          {hiddenCount > 0 ? 'Protected' : 'All visible'}
        </Badge>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">
            {group.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{group.description}</p>
          <div className="mt-2 divide-y divide-line">
            {group.fields.map((field) => {
              const visible = profile.visibility[field] === 'PUBLIC';
              return (
                <ToggleRow
                  key={field}
                  id={`visibility-${field}`}
                  checked={visible}
                  disabled={controlsDisabled}
                  onChange={(value) => void setVisibility(field, value)}
                  title={PROFILE_FIELD_LABELS[field]}
                  description={
                    visible
                      ? 'Visible to members'
                      : savingField === field
                        ? 'Saving…'
                        : 'Hidden from members'
                  }
                />
              );
            })}
          </div>
        </Card>
      ))}

      <Alert tone="info" title="Coming next">
        Audience-based visibility (“visible to matches only”) and workplace geofencing are part of
        the later privacy milestones. The data model already supports both.
      </Alert>

      <div>
        <Link href="/profile" className="text-sm font-semibold text-crimson underline">
          Back to my profile
        </Link>
      </div>
    </div>
  );
}
