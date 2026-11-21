import Image from 'next/image';
import Link from 'next/link';

export function Logo({
  href = '/',
  size = 'md',
  onDark = false,
}: {
  href?: string | null;
  size?: 'sm' | 'md';
  /** Use on Deep Navy surfaces (admin header). */
  onDark?: boolean;
}) {
  const mark = size === 'sm' ? 'size-8' : 'size-10';
  const text = size === 'sm' ? 'text-lg' : 'text-xl';
  const pixels = size === 'sm' ? 32 : 40;

  const content = (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/icon-512.png"
        alt=""
        width={pixels}
        height={pixels}
        className={`${mark} rounded-2xl object-cover shadow-sm`}
      />
      <span className={`${text} font-semibold tracking-tight ${onDark ? 'text-white' : 'text-navy'}`}>
        Kode<span className="text-crimson">Cupid</span>
      </span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex rounded-xl" aria-label="KodeCupid home">
      {content}
    </Link>
  );
}
