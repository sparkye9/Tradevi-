/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' }
        ]
      }
    ];
  },
  async redirects() {
    return [
      { source: '/kalshi', destination: '/', permanent: true },
      { source: '/kalshi/:path*', destination: '/', permanent: true },
      { source: '/mini-futures', destination: '/futures', permanent: true },
      { source: '/futures-bias', destination: '/futures', permanent: true },
      { source: '/trend-bias', destination: '/futures', permanent: true },
      { source: '/trade-discovery', destination: '/stocks', permanent: true },
    ];
  },
};

module.exports = nextConfig;
