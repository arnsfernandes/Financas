/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.15.5', '192.168.15.5:3000', 'localhost', 'localhost:3000', '0.0.0.0', '0.0.0.0:3000'],
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        path: false,
      }
    }
    return config
  },
}

export default nextConfig

