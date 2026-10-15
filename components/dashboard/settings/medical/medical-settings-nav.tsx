import { LinkTabs } from "@/components/dashboard/animals/tabs-nav/link-tabs";

// Settings → Medical's two pages. LinkTabs marks the longest matching href
// active, so Catalog (the bare /medical) is not active on Protocols.
const sections = [
  { href: "/dashboard/settings/medical", label: "Catalog" },
  { href: "/dashboard/settings/medical/protocols", label: "Protocols" },
];

export function MedicalSettingsNav() {
  return (
    <nav aria-label="Medical settings" className="overflow-x-auto">
      <LinkTabs links={sections} />
    </nav>
  );
}
