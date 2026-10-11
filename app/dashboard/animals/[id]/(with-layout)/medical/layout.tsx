import { IDParamType } from "@/app/lib/types";
import { LinkTabs } from "@/components/dashboard/animals/tabs-nav/link-tabs";

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
  { suffix: "/vitals", label: "Vitals" },
];

const Layout = async ({ children, params }: Props) => {
  const { id } = await params;
  const base = `/dashboard/animals/${id}/medical`;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Medical sections" className="overflow-x-auto">
        <LinkTabs
          links={sections.map((section) => ({
            href: `${base}${section.suffix}`,
            label: section.label,
          }))}
        />
      </nav>
      {children}
    </div>
  );
};

export default Layout;
