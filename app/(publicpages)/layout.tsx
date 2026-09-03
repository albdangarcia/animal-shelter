import DemoBanner from "@/components/demo-banner";
import Footer from "../../components/public-pages/footer";
import TopNavWrapper from "../../components/public-pages/nav/top-nav-wrapper";
import { isDemo } from "../../lib/flags";

export default async function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {isDemo && <DemoBanner />}
      {/* theme-organic scopes the design tokens to the public subtree, so these
          pages render the same whatever the dashboard's light/dark setting is.
          Full-bleed by design: bands run to the viewport edge and every page
          owns its own container. */}
      <div className="theme-organic flex min-h-screen flex-col bg-background text-foreground">
        <TopNavWrapper />
        <main className="grow">{children}</main>
        <Footer />
      </div>
    </>
  );
}
