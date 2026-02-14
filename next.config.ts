import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // eslint config is removed as it is deprecated in next.config.ts
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
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
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://utfs.io",
              "font-src 'self' data:",
              "connect-src 'self' https://utfs.io https://*.uploadthing.com https://*.inngest.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
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
