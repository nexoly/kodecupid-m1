'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, errorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Alert, Badge, EmptyState, LoadingBlock } from '@/components/ui/feedback';

interface SectionPayload {
  milestone: 1 | 2;
  title: string;
  description: string;
  items: {
    id: string;
    action?: string;
    admin?: string;
    createdAt?: string;
    targetType?: string | null;
    targetId?: string | null;
  }[];
}

/**
 * Permission-gated shell used by the admin sections that Milestone 2 fills in.
 * The fetch still goes through the API guard, which is what proves the
 * role difference server-side.
 */
export function AdminSectionShell({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<SectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SectionPayload>(`/admin/${endpoint}`, { auth: 'admin' })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setDenied(true);
        } else {
          setError(errorMessage(caught, 'Could not load this section.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (loading) {
    return <LoadingBlock label="Loading section" rows={3} />;
  }

  if (denied) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-navy">Not available for your role</h1>
        <p className="mt-2 text-sm text-muted">
          Your admin role does not include this section. Ask a Super Admin if you need access.
        </p>
      </Card>
    );
  }

  if (!data) {
    return <Alert tone="danger">{error ?? 'Could not load this section.'}</Alert>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{data.title}</h1>
        {data.milestone === 2 ? <Badge tone="neutral">Milestone 2</Badge> : <Badge tone="success">Live</Badge>}
      </div>
      <p className="text-sm text-muted">{data.description}</p>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={
            data.milestone === 2
              ? 'This queue starts receiving data when the matching milestone ships.'
              : 'Nothing has happened yet.'
          }
          icon="◎"
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line text-sm">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="font-medium text-charcoal">{item.action ?? item.id}</p>
                  <p className="text-xs text-muted">
                    {[item.targetType, item.targetId].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{item.admin ?? 'system'}</p>
                  <p>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
