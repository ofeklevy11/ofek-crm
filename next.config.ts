const nextConfig = {
  productionSourceMaps: false,
  serverExternalPackages: ["puppeteer"],
  experimental: {
    turbo: {
      sourceMaps: false,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
    ],
  },
};

module.exports = nextConfig;
