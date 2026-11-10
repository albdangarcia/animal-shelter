import { IDParamType } from "@/app/lib/types";
import { LinkTabs } from "@/components/dashboard/animals/tabs-nav/link-tabs";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  children: React.ReactNode;
  params: IDParamType;
}

// The Medical tab's own sections. LinkTabs marks the longest matching href
// active, so Overview (the bare /medical) is not active on its sub-pages.
const sections = [
  { suffix: "", label: "Overview" },
  { suffix: "/history", label: "History" },
  { suffix: "/vaccines-tests", label: "Vaccines & Tests" },
  { suffix: "/medications", label: "Medications" },
  { suffix: "/conditions", label: "Conditions" },
  { suffix: "/vitals", label: "Vitals" },
  { suffix: "/documents", label: "Documents" },
];

const Layout = async ({ children, params }: Props) => {
  const [{ id }, help] = await Promise.all([
    params,
    getHelpLinkGuide(PAGE_HELP_GUIDES.animalMedical),
  ]);
  const base = `/dashboard/animals/${id}/medical`;

  return (
    <div className="flex flex-col gap-4">
      {/* The "?" sits in the nav, beside the tabs, so the nav stays a direct
          child of this column (the loading-layout spec reads its parent). */}
      <nav aria-label="Medical sections" className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <LinkTabs
            scrollable
            links={sections.map((section) => ({
              href: `${base}${section.suffix}`,
              label: section.label,
            }))}
          />
        </div>
        <HelpLink guide={help} />
      </nav>
      {children}
    </div>
  );
};

export default Layout;
