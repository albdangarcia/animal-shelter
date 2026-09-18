import { getCachedSession } from "@/app/lib/auth/session";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/nav/sidebar-links";
import { CommandPaletteProvider } from "@/components/dashboard/search/command-palette-provider";
import type { PaletteNavItem } from "@/components/dashboard/search/command-palette";
import { SiteHeader } from "@/components/site-header";
import { getFilteredNavLinks, getFilteredDocuments, hasAnyPermission } from "../lib/getFilteredLinks";
import { documentItems, navMainItems, navSecondaryItems, SEARCH_PERMISSIONS } from "@/components/dashboard/nav/nav-links.config";
import { hasPermission } from "../lib/auth/hasPermission";
import { aiAssistantItem } from "@/components/dashboard/nav/nav-links.config";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = async ({ children }: LayoutProps) => {
  const [session, cookieStore] = await Promise.all([
    getCachedSession(),
    cookies(),
  ]);
  if (!session || !session.user) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  }
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  // Filter navigation links based on user permissions
  const [filteredNavMain, filteredDocuments, filteredNavSecondary, canUseAi, canSearch] =
  await Promise.all([
    getFilteredNavLinks(navMainItems),
    getFilteredDocuments(documentItems),
    getFilteredNavLinks(navSecondaryItems),
    hasPermission(aiAssistantItem.permission),
    hasAnyPermission(SEARCH_PERMISSIONS),
  ]);

  // The palette's Pages group. Built from the same permission-filtered lists the
  // sidebar renders, so it can never offer a destination the viewer can't open.
  const paletteNavItems: PaletteNavItem[] = [
    ...filteredNavMain.map(({ title, url, icon }) => ({ title, url, icon })),
    ...filteredDocuments.map(({ name, url, icon }) => ({ title: name, url, icon })),
    ...filteredNavSecondary.map(({ title, url, icon }) => ({ title, url, icon })),
  ];

  const shell = (
    <>
      <AppSidebar
        user={session.user}
        navMainItems={filteredNavMain}
        documentItems={filteredDocuments}
        navSecondaryItems={filteredNavSecondary}
        variant="inset"
        showAiAssistant={canUseAi}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="max-w-7xl mx-auto flex w-full flex-col gap-4 py-4 px-4 lg:px-6 md:gap-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </>
  );

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      {/* Adopters and fosters hold none of the search permissions, so they get
          neither the ⌘K listener nor the dialog. `SearchTrigger` reads the same
          context, so the header button disappears with it. */}
      {canSearch ? (
        <CommandPaletteProvider navItems={paletteNavItems}>
          {shell}
        </CommandPaletteProvider>
      ) : (
        shell
      )}
    </SidebarProvider>
  );
};

export default Layout;
