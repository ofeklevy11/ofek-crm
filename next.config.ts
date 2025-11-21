const nextConfig = {
  productionSourceMaps: false,
  experimental: {
    turbo: {
      sourceMaps: false,
    },
  },
};

module.exports = nextConfig;