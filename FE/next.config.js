/** Hàm lấy URL API công khai. Mục đích: gom cấu hình domain API để tái sử dụng cho preconnect và bảo mật header. */
function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || '';
}

const apiBaseUrl = getApiBaseUrl();
const apiOrigin = new URL(apiBaseUrl).origin;
const siteOrigin = getSiteUrl() ? new URL(getSiteUrl()).origin : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none'
          }
        ]
      },
      {
        source: '/donate/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Web3 — ZeroDev SDK calls RPC/bundler/paymaster từ browser
              `connect-src 'self' ${siteOrigin ? `'${siteOrigin}'` : ''} ${apiOrigin} https://*.zerodev.app https://*.polygonscan.com https://*.polygon.technology`.trim(),
              // PayOS — tạo payment link từ client-side SDK
              "frame-src 'self' https://*.payos.vn https://api-merchant.payos.vn",
              // Google OAuth — đăng nhập để claim ví
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
              "frame-src 'self' https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `img-src 'self' data: blob: ${siteOrigin ? `'${siteOrigin}'` : ''}`.trim(),
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          }
        ]
      },
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=86400'
          }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
