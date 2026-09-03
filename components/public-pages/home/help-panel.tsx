import Link from "next/link";

const WAYS_TO_HELP = [
  {
    number: "01",
    title: "Donate",
    copy: "$75 covers a full course of vaccinations for one animal in our care.",
    linkText: "Give today →",
    href: "/donate",
  },
  {
    number: "02",
    title: "Volunteer",
    copy: "Dog walking, cat socialising and Saturday admin. Two hours a week is plenty.",
    linkText: "Join the rota →",
    href: "/volunteer",
  },
  {
    number: "03",
    title: "Foster",
    copy: "Open your home for a few weeks. We cover food, kit and every vet bill.",
    linkText: "How fostering works →",
    href: "/foster",
  },
];

/** The three non-adoption asks, below the browse strip. */
const HelpPanel = () => (
  <section
    aria-labelledby="how-to-help-heading"
    className="mx-auto w-full max-w-6xl px-5 pt-4 pb-16 sm:px-8 lg:px-14 lg:pb-20"
  >
    <div className="grid gap-10 rounded-[28px] bg-organic-sage-100 p-8 sm:grid-cols-2 sm:p-11 lg:grid-cols-[0.9fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <h2
        id="how-to-help-heading"
        className="max-w-[9ch] font-display text-[32px]"
      >
        Not adopting today?
      </h2>

      {WAYS_TO_HELP.map((way) => (
        <div key={way.number}>
          <div className="mb-2 font-display text-[13px] text-organic-accent-700">
            {way.number}
          </div>
          <h3 className="mb-2 font-display text-[19px]">{way.title}</h3>
          <p className="mb-3 text-[14px] leading-[1.6] text-organic-neutral-800">
            {way.copy}
          </p>
          <Link
            href={way.href}
            className="text-[13.5px] text-organic-accent-700 hover:underline"
          >
            {way.linkText}
          </Link>
        </div>
      ))}
    </div>
  </section>
);

export default HelpPanel;
