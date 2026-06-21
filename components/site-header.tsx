"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./light-dark-theme/theme-toggle";

// Helper function to format the title string
const formatTitle = (s: string) => {
  if (typeof s !== 'string' || s.length === 0) {
    return '';
  }
  // 1. Split the string by hyphens.
  // 2. Capitalize the first letter of each word.
  // 3. Join the words back together with a space.
  return s
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function SiteHeader() {
  const pathname = usePathname(); // e.g., "/dashboard/adoption-applications"
  const segments = pathname.split('/').filter(Boolean); // e.g., ["dashboard", "adoption-applications"]

  let title = "Dashboard"; // Default title

  // If the path is /dashboard/*, use the second segment for the title
  if (segments[0] === 'dashboard' && segments.length > 1) {
    title = formatTitle(segments[1]);
  } else if (segments.length > 0) {
    title = formatTitle(segments[0]);
  }

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-[var(--header-height)]">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}