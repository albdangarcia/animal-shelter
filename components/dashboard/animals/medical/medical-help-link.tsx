"use client";

import { usePathname } from "next/navigation";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";

/**
 * The Medical tab's "?", one guide per page. The layout holds it, so it
 * reads the path to tell the sections apart: Vitals has its own guide (one a
 * volunteer can see), and every other section opens the medical guide.
 * Either is null when the user can't see it, and then nothing renders.
 */
export function MedicalHelpLink({
  medical,
  vitals,
  vitalsHref,
}: {
  medical: HelpLinkGuide | null;
  vitals: HelpLinkGuide | null;
  vitalsHref: string;
}) {
  const pathname = usePathname();
  const onVitals =
    pathname === vitalsHref || pathname.startsWith(`${vitalsHref}/`);
  return <HelpLink guide={onVitals ? vitals : medical} />;
}
