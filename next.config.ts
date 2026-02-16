import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // eslint config is removed as it is deprecated in next.config.ts
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "*.ufs.sh",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // CSP is set per-request in middleware.ts (nonce-based)
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/inngest": ["./pdf/static/*.ttf"],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      /Failed to parse source map/,
      /Invalid source map/,
    ];
    return config;
  },
  // Silence the error about conflicting webpack config when using Turbopack (default in Next.js 16)
  // @ts-ignore - Types might not be up to date yet
  turbopack: {},
};

export default nextConfig;
