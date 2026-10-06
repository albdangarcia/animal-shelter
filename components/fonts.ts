import localFont from "next/font/local";

// Self-hosted, not `next/font/google`. Turbopack downloads Google fonts while it
// compiles, and Google's stylesheet API sometimes answers with
// `/l/font?kit=…&skey=…` URLs that Turbopack cannot parse
// (https://github.com/vercel/next.js/issues/99114). That failed the compile of
// app/layout.tsx, so every page answered 500 for the rest of that server's life
// (an e2e shard ran zero tests), and a Vercel build can fail the same way.
// app/fonts/README.md says where the files come from and how they were made.

export const fontgeist = localFont({
  src: "../app/fonts/geist.woff2",
  weight: "100 900",
});

// Organic design system — public pages only. Caprasimo for display/headings,
// Figtree for body. Both exposed as variables; the .theme-organic scope in
// globals.css picks them up, so the dashboard is unaffected.
export const caprasimo = localFont({
  src: "../app/fonts/caprasimo.woff2",
  weight: "400",
  variable: "--font-caprasimo",
  display: "swap",
});

// One variable file declared at the three weights the site asked Google for, so
// another weight (500, say) still resolves to the nearest of the three instead
// of being drawn as a true 500.
export const figtree = localFont({
  src: [
    { path: "../app/fonts/figtree.woff2", weight: "400" },
    { path: "../app/fonts/figtree.woff2", weight: "600" },
    { path: "../app/fonts/figtree.woff2", weight: "700" },
  ],
  variable: "--font-figtree",
  display: "swap",
});
