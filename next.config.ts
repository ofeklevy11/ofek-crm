const nextConfig = {
  productionSourceMaps: false,
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
