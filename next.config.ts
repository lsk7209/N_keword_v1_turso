import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 보안: Powered-By 헤더 제거
  poweredByHeader: false,

  // 압축 활성화 (Vercel에서 자동 처리되지만 명시)
  compress: true,

  // 로깅 최적화
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // 이미지 최적화 설정
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Experimental 기능 (성능 향상)
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // 번들 분석을 위한 설정 (개발 시 활성화 가능)
  // webpack: (config, { isServer }) => {
  //   if (!isServer) {
  //     config.optimization.splitChunks = {
  //       chunks: 'all',
  //       cacheGroups: {
  //         default: false,
  //         vendors: false,
  //         react: {
  //           name: 'react',
  //           chunks: 'all',
  //           test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
  //         },
  //       },
  //     };
  //   }
  //   return config;
  // },
};

export default nextConfig;