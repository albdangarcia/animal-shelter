import Link from "next/link";

interface SpeciesPillsProps {
  speciesNames: string[];
}

/**
 * Shortcut links into /pets, one per species plus an "Everyone" entry.
 *
 * These are links, not filter controls — no filtering happens on the homepage,
 * so none of them is ever in an "active" state. Data-driven rather than the
 * mockup's hardcoded Dogs/Cats/Birds, because species are editable from the
 * dashboard and a hardcoded pill would eventually point at an empty list.
 */
const SpeciesPills = ({ speciesNames }: SpeciesPillsProps) => (
  <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 lg:flex-wrap lg:justify-end lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <Link
      href="/pets"
      className="shrink-0 snap-start rounded-full border border-border px-[18px] py-[9px] text-[13.5px] transition-colors hover:bg-primary hover:text-primary-foreground"
    >
      Everyone
    </Link>
    {speciesNames.map((name) => (
      <Link
        key={name}
        href={`/pets?page=1&category=${encodeURIComponent(name)}`}
        className="shrink-0 snap-start rounded-full border border-border px-[18px] py-[9px] text-[13.5px] transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        {name}
      </Link>
    ))}
  </div>
);

export default SpeciesPills;
