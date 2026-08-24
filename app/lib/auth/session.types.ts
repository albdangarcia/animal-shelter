import type { auth } from "@/auth";

// Types only — no runtime imports. Safe for a "use client" component to
// import directly; `import type { auth }` is erased entirely, so this file
// compiles to an empty module regardless of how a consumer imports it.
export type SessionUser = typeof auth.$Infer.Session.user;
