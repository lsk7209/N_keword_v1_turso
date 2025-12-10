import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
