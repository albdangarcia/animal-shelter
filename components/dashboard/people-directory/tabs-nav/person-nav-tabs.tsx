"use client";

import { usePathname } from "next/navigation";
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
import { LinkTabs } from "../../animals/tabs-nav/link-tabs";

const personTabDefinitions = [
  { suffix: "", label: "Animal History" },
  { suffix: "/adoption-applications", label: "Adoption Applications" },
  { suffix: "/activity", label: "Activity" },
];

export function PersonNavTabs() {
  const pathname = usePathname();

  const basePath = pathname.split("/").slice(0, 4).join("/");

  const dynamicLinks = personTabDefinitions.map((tab) => ({
    href: `${basePath}${tab.suffix}`,
    label: tab.label,
  }));

  return (
    <div className="@container/tabs">
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-32 @[581px]/tabs:hidden">
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
                      isActive ? "bg-accent font-semibold" : "",
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

      <LinkTabs links={dynamicLinks} className="hidden @[581px]/tabs:block" />
    </div>
  );
}
