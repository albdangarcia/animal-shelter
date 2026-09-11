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
import { Menu } from "lucide-react";

// Define the tabs with their unique suffix and label.
// The default tab ('Activity') has an empty suffix to match the base route.
const animalTabDefinitions = [
  { suffix: "", label: "Activity" },
  { suffix: "/tasks", label: "Tasks" },
  { suffix: "/journey", label: "Journey" },
  { suffix: "/notes", label: "Notes" },
  { suffix: "/vitals", label: "Vitals" },
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

  return (
    <div className="@container/tabs">
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-32 @[700px]/tabs:hidden">
          <Button variant="outline">
            <Menu className="mr-2 h-4 w-4" />
            Navigation
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuGroup>
            {dynamicLinks.map((link) => {
              const isActive =
                link.href === basePath
                  ? pathname === link.href
                  : pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} passHref>
                  <DropdownMenuItem
                    className={cn(
                      "cursor-pointer",
                      isActive ? "bg-accent font-semibold" : ""
                    )}
                  >
                    {link.label}
                  </DropdownMenuItem>
                </Link>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <LinkTabs links={dynamicLinks} className="hidden @[700px]/tabs:block" />
    </div>
  );
}