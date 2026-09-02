import Link from "next/link";

// Species links are hardcoded to Dog and Cat only — those two are stable in the
// seed. A name that doesn't exist would 404 into an empty filtered list.
const footerColumns = [
  {
    heading: "Adopt",
    links: [
      { name: "All animals", href: "/pets" },
      { name: "Dogs", href: "/pets?category=Dog" },
      { name: "Cats", href: "/pets?category=Cat" },
    ],
  },
  {
    heading: "Support",
    links: [
      { name: "Donate", href: "#" },
      { name: "Volunteer", href: "#" },
      { name: "Foster", href: "/foster" },
    ],
  },
  {
    heading: "About",
    links: [
      { name: "About", href: "/about" },
      { name: "Contact", href: "/contact" },
      { name: "Privacy", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-organic-neutral-900 px-5 py-14 text-organic-neutral-200 sm:px-8 lg:px-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-3 font-display text-[20px] text-background">
              Pet Adopt
            </div>
            <p className="m-0 max-w-[30ch] text-[14px] leading-[1.6] text-organic-neutral-400">
              120 Maple Street, Springfield. Open Wednesday to Sunday, 11am –
              6pm.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div
              key={column.heading}
              className="flex flex-col gap-[10px] text-[14px]"
            >
              <div className="font-display text-[12px] tracking-[0.08em] text-organic-neutral-500 uppercase">
                {column.heading}
              </div>
              {column.links.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-inherit transition-colors hover:text-background"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-organic-neutral-800 pt-[22px] text-[12.5px] text-organic-neutral-500 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Pet Adopt</span>
          <span>Springfield</span>
        </div>
      </div>
    </footer>
  );
}
