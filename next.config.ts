import type { NextConfig } from "next";

// Set only for the Playwright web server (playwright/env.ts), so the e2e dev
// server keeps its lock file and Turbopack cache apart from `npm run dev`'s and
// both can run in one checkout. tsconfig.e2e.json only extends tsconfig.json:
// Next leaves a config that extends another untouched, so the e2e server does
// not add its own types folder to tsconfig.json's `include`.
const e2eDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR;

// Also set only for the Playwright web server. The e2e server serves images
// as-is instead of through /_next/image: one optimization that never finished
// (sharp on CI's Linux) left a page's `load` event pending until the test timed
// out, and every later request for the same image waited on it. No spec checks
// resizing, so the optimizer only adds a way to hang.
const e2eUnoptimizedImages =
  process.env.PLAYWRIGHT_UNOPTIMIZED_IMAGES === "1";

const nextConfig: NextConfig = {
  ...(e2eDistDir && {
    distDir: e2eDistDir,
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  }),
  reactCompiler: true,
  // Staff guides are markdown read from docs/guides/ at request time
  // (app/lib/guides/store.ts), which the build's file trace can't see. List
  // them for every dashboard route, since the Help pages and the "?" links on
  // the medical pages read them, for the search route's Help group, and for
  // the assistant's searchGuides and readGuide tools.
  outputFileTracingIncludes: {
    "/dashboard/**": ["./docs/guides/*.md"],
    "/api/search": ["./docs/guides/*.md"],
    "/api/ai-chat": ["./docs/guides/*.md"],
  },
  // `next dev` logs every server function call with its arguments, so signing
  // in printed the email and password in plain text. Next has no per-argument
  // redaction, so the call log is off.
  logging: { serverFunctions: false },
  images: {
    ...(e2eUnoptimizedImages && { unoptimized: true }),
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