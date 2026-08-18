import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/nav/sidebar-links";
import { SiteHeader } from "@/components/site-header";
import { getFilteredNavLinks, getFilteredDocuments } from "../lib/getFilteredLinks";
import { documentItems, navMainItems, navSecondaryItems } from "@/components/dashboard/nav/nav-links.config";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = async ({ children }: LayoutProps) => {
  const session = await auth();
  if (!session || !session.user) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  }

  // Filter navigation links based on user permissions
  const [filteredNavMain, filteredDocuments, filteredNavSecondary] =
    await Promise.all([
      getFilteredNavLinks(navMainItems),
      getFilteredDocuments(documentItems),
      getFilteredNavLinks(navSecondaryItems),
    ]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        user={session.user}
        navMainItems={filteredNavMain}
        documentItems={filteredDocuments}
        navSecondaryItems={filteredNavSecondary}
        variant="inset"
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
    </SidebarProvider>
  );
};

export default Layout;