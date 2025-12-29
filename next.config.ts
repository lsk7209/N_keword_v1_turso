import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages 배포를 위한 설정
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // 환경 변수 설정
  env: {
    NEXT_PUBLIC_TURSO_DATABASE_URL: process.env.NEXT_PUBLIC_TURSO_DATABASE_URL,
    NEXT_PUBLIC_TURSO_AUTH_TOKEN: process.env.NEXT_PUBLIC_TURSO_AUTH_TOKEN,
  },
};

export default nextConfig;