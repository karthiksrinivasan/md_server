import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_MD_SERVE_ROOT: process.env.MD_SERVE_ROOT ?? '.',
    NEXT_PUBLIC_MD_SERVE_INCLUDE: process.env.MD_SERVE_INCLUDE ?? '',
    NEXT_PUBLIC_MD_SERVE_EXCLUDE: process.env.MD_SERVE_EXCLUDE ?? '',
    NEXT_PUBLIC_MD_SERVE_FILTER: process.env.MD_SERVE_FILTER ?? '',
  },
  serverExternalPackages: ['@parcel/watcher', 'picomatch', 'gray-matter'],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
