import type { NextConfig } from "next";

// Set only for the Playwright web server (playwright/env.ts), so the e2e dev
// server keeps its lock file and Turbopack cache apart from `npm run dev`'s and
// both can run in one checkout. tsconfig.e2e.json only extends tsconfig.json:
// Next leaves a config that extends another untouched, so the e2e server does
// not add its own types folder to tsconfig.json's `include`.
const e2eDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  ...(e2eDistDir && {
    distDir: e2eDistDir,
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  }),
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