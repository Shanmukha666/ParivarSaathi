const isProd = process.env.NODE_ENV === 'production';
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL || '');
// Production: only our own services. Without configured origins fall back to https/wss (never localhost).
const connectSrc = isProd
  ? (supabaseOrigin || apiOrigin
      ? ["'self'", supabaseOrigin, supabaseOrigin.replace('https://', 'wss://'), apiOrigin].filter(Boolean).join(' ')
      : "'self' https: wss:")
  : "'self' http://localhost:8000 http://127.0.0.1:8000 ws://localhost:8000 ws://127.0.0.1:8000 https: wss:";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), geolocation=(), microphone=(self), payment=()',
        },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' " + (process.env.NODE_ENV === 'production' ? '' : "'unsafe-eval' ") + "'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src " + connectSrc + "; frame-ancestors 'none';",
        },
      ],
    },
    {
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: 'no-store' }],
    },
  ],
};

module.exports = nextConfig;
