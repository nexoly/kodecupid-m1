import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this Next.js origin. `/api/*` is proxied to the
 * Nest API server-side, which keeps auth cookies first-party (SameSite=Lax)
 * even though the API runs on a different host in staging.
 */
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
  // Route names used in the Milestone 1 brief, mapped onto the app's pages.
  // Query strings (e.g. ?next=) are carried over automatically.
  async redirects() {
    return [
      { source: '/dashboard', destination: '/app', permanent: false },
      { source: '/verify-otp', destination: '/verify', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
