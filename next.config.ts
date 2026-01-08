const nextConfig = {
  /* productionSourceMaps: false, // Removed as it caused an unrecognized key error */
  serverExternalPackages: ["puppeteer"],
  /* experimental: {
    turbo: {
      sourceMaps: false,
    },
  }, */
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
