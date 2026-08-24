"use client"

import * as React from "react";
import type { SessionUser } from "@/app/lib/auth/session.types";
import { IconPaw } from "@tabler/icons-react";
import Link from "next/link";
import { NavDocuments } from "@/components/dashboard/nav/side-nav-documents";
import { NavMain } from "@/components/dashboard/nav/side-nav-main";
import { NavSecondary } from "@/components/dashboard/nav/side-nav-secondary";
import { NavUser } from "@/components/dashboard/nav/side-nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavDocument, NavItem } from "./nav-links.config";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: SessionUser;
  navMainItems: NavItem[];
  documentItems: NavDocument[];
  navSecondaryItems: NavItem[];
}

export function AppSidebar({
  user,
  navMainItems,
  documentItems,
  navSecondaryItems,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/">
                <IconPaw className="!size-5" />
                <span className="text-base font-semibold">Pet Adopt</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navMainItems.length > 0 && <NavMain items={navMainItems} />}
        {documentItems.length > 0 && <NavDocuments items={documentItems} />}
        {navSecondaryItems.length > 0 && (
          <NavSecondary items={navSecondaryItems} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}