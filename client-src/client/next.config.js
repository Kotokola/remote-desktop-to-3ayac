/** @type {import('next').NextConfig} */
const isExport = process.env.GHPAGES === '1';
const nextConfig = {
  reactStrictMode: true,
  output: isExport ? 'export' : undefined,
  basePath: isExport ? '/remote-desktop-to-3ayac' : '',
  assetPrefix: isExport ? '/remote-desktop-to-3ayac/' : undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  async rewrites() {
    if (isExport) return [];
    return [
      { source: '/api/:path*', destination: 'http://localhost:8765/api/:path*' },
      { source: '/ws', destination: 'http://localhost:8765/ws' },
    ];
  },
};
module.exports = nextConfig;
