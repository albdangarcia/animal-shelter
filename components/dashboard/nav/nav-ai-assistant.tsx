"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSparkles } from "@tabler/icons-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const AI_CHAT_URL = "/dashboard/ai-chat";

/**
 * The AI assistant entry point. Deliberately styled as a filled button rather
 * than a nav link so it reads as an action, not a destination — every other
 * sidebar item is a ghost button, so this is the only solid element in the
 * column. Lives in `SidebarHeader`, below the logo.
 *
 * Permission-gated by the caller (`AppPermissions.AI_CHAT_USE`), not here.
 */
export const NavAiAssistant = () => {
  const pathname = usePathname();
  const isActive =
    pathname === AI_CHAT_URL || pathname.startsWith(`${AI_CHAT_URL}/`);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip="Ask the AI assistant"
          className={cn(
            "h-9 gap-2 font-medium",
            "bg-primary text-primary-foreground shadow-xs",
            "transition-colors duration-150",
            // SidebarMenuButton's own hover/active rules target sidebar-accent,
            // so they have to be overridden or the fill drops out on hover.
            "hover:bg-primary/90 hover:text-primary-foreground",
            "active:bg-primary/90 active:text-primary-foreground",
            "focus-visible:ring-primary/50 focus-visible:ring-2",
            // Collapsed rail: keeps the square filled tile instead of shrinking
            // to a bare icon.
            "group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-0",
            "group-data-[collapsible=icon]:justify-center",
            isActive &&
              "ring-primary/40 ring-offset-sidebar ring-2 ring-offset-2",
          )}
        >
          <Link href={AI_CHAT_URL}>
            <IconSparkles aria-hidden="true" />
            <span>AI Assistant</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};