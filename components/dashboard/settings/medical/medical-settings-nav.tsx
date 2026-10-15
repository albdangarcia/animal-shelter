import { LinkTabs } from "@/components/dashboard/animals/tabs-nav/link-tabs";

// Settings → Medical's pages. LinkTabs marks the longest matching href
// active, so Catalog (the bare /medical) is not active on the others.
const sections = [
  { href: "/dashboard/settings/medical", label: "Catalog" },
  { href: "/dashboard/settings/medical/protocols", label: "Protocols" },
  { href: "/dashboard/settings/medical/dose-times", label: "Dose times" },
];

export function MedicalSettingsNav() {
  return (
    <nav aria-label="Medical settings" className="overflow-x-auto">
      <LinkTabs links={sections} />
    </nav>
  );
}
