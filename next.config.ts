import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Allow loading images from specific remote domains
    remotePatterns: [
      {
        protocol: "https", // Only allow HTTPS protocol
        hostname: "lh3.googleusercontent.com", // Allow Google user content images
      },
      {
        protocol: "https", // Only allow HTTPS protocol
        hostname: "avatars.githubusercontent.com", // Allow GitHub avatar images
      },
      {
        protocol: 'https',
        // This pattern allows any hostname from Vercel's Blob storage.
        hostname: '**.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;