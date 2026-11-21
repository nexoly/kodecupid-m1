'use client';

import { useRef, useState } from 'react';
import { MAX_PHOTOS, type ProfilePhotoView } from '@kodecupid/shared';
import { apiFetch, apiUpload, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Basic photo manager: upload, reorder (make primary), delete. The API rejects
 * anything that is not a real JPEG/PNG/WebP under 4 MB.
 */
export function PhotoManager({
  photos,
  onChange,
}: {
  photos: ProfilePhotoView[];
  onChange: (photos: ProfilePhotoView[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await apiUpload<{ photos: ProfilePhotoView[] }>('/profile/photos', file);
      onChange(result.photos);
    } catch (caught) {
      setError(errorMessage(caught, 'That photo could not be uploaded.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(photoId: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ photos: ProfilePhotoView[] }>(
        `/profile/photos/${photoId}`,
        { method: 'DELETE' },
      );
      onChange(result.photos);
    } catch (caught) {
      setError(errorMessage(caught, 'That photo could not be removed.'));
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(photoId: string): Promise<void> {
    const ordered = [photoId, ...photos.map((photo) => photo.id).filter((id) => id !== photoId)];
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ photos: ProfilePhotoView[] }>('/profile/photos/order', {
        method: 'PATCH',
        body: { photoIds: ordered },
      });
      onChange(result.photos);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not reorder the photos.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo) => (
          <figure
            key={photo.id}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-alabaster"
          >
            {/* Plain img keeps the M1 build free of remote-domain image config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.isPrimary ? 'Primary profile photo' : 'Profile photo'}
              className="size-full object-cover"
              loading="lazy"
            />
            {photo.isPrimary ? (
              <span className="absolute left-2 top-2 rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                Primary
              </span>
            ) : null}
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
              {!photo.isPrimary ? (
                <button
                  type="button"
                  onClick={() => void makePrimary(photo.id)}
                  disabled={busy}
                  className="rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-navy shadow"
                >
                  Make primary
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => void remove(photo.id)}
                disabled={busy}
                aria-label="Remove photo"
                className="rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-crimson shadow"
              >
                Remove
              </button>
            </div>
          </figure>
        ))}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line bg-white text-xs font-medium text-muted hover:border-crimson/40 hover:text-crimson"
          >
            <span aria-hidden className="text-xl">
              +
            </span>
            {busy ? 'Uploading…' : 'Add photo'}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted">
        {photos.length}/{MAX_PHOTOS} photos · JPEG, PNG or WebP · up to 4 MB each
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose a photo
        </Button>
      </div>
    </div>
  );
}
