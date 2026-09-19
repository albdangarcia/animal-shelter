import { notFound } from "next/navigation";

// Unmatched URLs skip layouts and fall through to the root not-found, which
// would drop the dashboard shell. Matching them here and throwing keeps them
// inside `dashboard/layout.tsx`, rendered by `dashboard/not-found.tsx`.
const Page = (): never => notFound();

export default Page;
