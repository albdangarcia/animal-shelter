"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "./link-tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

// Define the tabs with their unique suffix and label.
// The default tab ('Activity') has an empty suffix to match the base route.
const animalTabDefinitions = [
  { suffix: "", label: "Activity" },
  { suffix: "/tasks", label: "Tasks" },
  { suffix: "/journey", label: "Journey" },
  { suffix: "/notes", label: "Notes" },
  { suffix: "/medical", label: "Medical" },
  { suffix: "/characteristics", label: "Characteristics" },
  { suffix: "/assessments", label: "Assessments" },
  { suffix: "/adoption-applications", label: "Applications" },
  { suffix: "/photos", label: "Photos" },
];

export function AnimalNavTabs() {
  const pathname = usePathname();

  // Extracts the base path, including the dynamic ID.
  // This assumes a URL structure of "/dashboard/animals/[id]/..."
  // It takes the first 4 segments, e.g., from "/dashboard/animals/123/tasks" it gets "/dashboard/animals/123".
  const basePath = pathname.split("/").slice(0, 4).join("/");

  // Create the fully-formed, dynamic links by appending the suffix to the base path
  const dynamicLinks = animalTabDefinitions.map((tab) => ({
    href: `${basePath}${tab.suffix}`,
    label: tab.label,
  }));
  const activeLink = dynamicLinks
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="@container/tabs">
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="@[700px]/tabs:hidden">
          <Button variant="outline" aria-label={`Animal sections: ${activeLink?.label ?? "Activity"}`}>
            {activeLink?.label ?? "Activity"}
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuGroup>
            {dynamicLinks.map((link) => {
              const isActive = link.href === activeLink?.href;
              return (
                <DropdownMenuItem
                  key={link.href}
                  asChild
                  className={cn(
                    "cursor-pointer",
                    isActive ? "bg-accent font-semibold" : ""
                  )}
                >
                  <Link href={link.href} aria-current={isActive ? "page" : undefined}>
                    {link.label}
                    {isActive && <Check className="ml-auto size-4" aria-hidden="true" />}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <LinkTabs links={dynamicLinks} className="hidden @[700px]/tabs:block" />
    </div>
  );
}
