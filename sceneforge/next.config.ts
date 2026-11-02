import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'sharp', '@remotion/renderer', '@remotion/bundler'],
  // Uploads are handled by our own route with explicit size limits.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default nextConfig;
