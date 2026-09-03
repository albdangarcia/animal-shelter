import Link from "next/link";

/**
 * Marketing page — no data of its own, so it stays a plain server component.
 *
 * There is no volunteer application flow, so the only action on this page is
 * getting in touch, and that one genuinely works: the CTA is a real link to
 * /contact, which already carries a Volunteer address and phone number.
 *
 * "How to start" is numbered because it really is a sequence, unlike the
 * amounts on /donate. It deliberately does *not* copy /foster's "How it
 * works", which stacks a Caprasimo numeral above each step across a
 * three-column grid: the two pages sit next to each other in the homepage
 * help panel, and two grids of display numerals would read as one template
 * with the words swapped. Here the numbers are inline, at body size, on a
 * single vertical list — same information, visibly a different page.
 */

const WHAT_VOLUNTEERS_DO = [
  {
    title: "Dog walking",
    copy: "Two or three dogs an hour on our routes around the park. We show you the handling on your first shift — you do not need to have done it before.",
  },
  {
    title: "Cat socialising",
    copy: "Sitting in the cat room, brushing, playing, and getting nervous cats used to being around people again. Quiet work, and the most useful hour of some animals' week.",
  },
  {
    title: "Saturday admin",
    copy: "The front desk on our busiest day: greeting visitors, answering the phone, and keeping the adoption paperwork moving so nobody waits.",
  },
];

const HOW_TO_START = [
  {
    title: "Get in touch",
    copy: "Tell us which of the three interests you and roughly when you are free. The volunteer email and phone number are on our contact page.",
  },
  {
    title: "Come and look round",
    copy: "An hour at the shelter meeting the team and seeing the work, before you commit to anything at all.",
  },
  {
    title: "Do your first shift",
    copy: "You are paired with an experienced volunteer until you would rather not be. Most people stop needing us after two or three visits.",
  },
];

const Page = () => (
  <>
    {/* The same accent band the nav carries, so the two read as one surface.
        No CTA in the band. */}
    <section className="bg-organic-accent-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
        <h1 className="mb-5 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
          Volunteer
        </h1>
        <p className="max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
          Animals wait better when there are more people around them. Two hours
          a week is enough to make that difference, and we will teach you
          everything else.
        </p>
      </div>
    </section>

    <section
      aria-labelledby="what-volunteers-do-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      {/* Heading left, rows right — /contact's directory shell as well as its
          hairlines, which is also what stops the page running as one narrow
          column down the left edge at 1280 and wider. */}
      <div className="grid gap-8 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
        <h2
          id="what-volunteers-do-heading"
          className="max-w-[12ch] font-display text-[32px]"
        >
          What volunteers do
        </h2>

        <ul className="m-0 list-none p-0">
          {WHAT_VOLUNTEERS_DO.map((role) => (
            <li
              key={role.title}
              className="border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0"
            >
              <h3 className="mb-2 font-display text-[21px]">{role.title}</h3>
              <p className="m-0 text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
                {role.copy}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section
      aria-labelledby="what-we-ask-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <div className="grid gap-8 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
        <h2
          id="what-we-ask-heading"
          className="max-w-[12ch] font-display text-[32px]"
        >
          What we ask
        </h2>

        {/* Concrete on purpose: "a few hours when you can" tells nobody
            whether they qualify. */}
        <div className="flex flex-col gap-4 text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
          <p className="m-0">
            Two hours a week, the same slot each week, for at least three
            months. Animals settle to a routine and a familiar face, and both of
            those take longer to build than a single visit.
          </p>
          <p className="m-0">
            You need to be 18 or over to walk dogs or to cover the front desk on
            your own. Sixteen and seventeen year olds are welcome on every shift
            alongside a parent or guardian.
          </p>
        </div>
      </div>
    </section>

    <section
      aria-labelledby="how-to-start-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <div className="grid gap-8 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
        <h2
          id="how-to-start-heading"
          className="max-w-[12ch] font-display text-[32px]"
        >
          How to start
        </h2>

        {/* Inline numerals at body size on a vertical list — see the note at
            the top of this file for why this is not /foster's treatment. */}
        <ol className="m-0 flex list-none flex-col gap-7 p-0">
          {HOW_TO_START.map((step, index) => (
            <li key={step.title} className="flex gap-4 sm:gap-5">
              <span
                aria-hidden="true"
                className="w-4 shrink-0 text-[15px] leading-[1.6] text-organic-accent-700 tabular-nums"
              >
                {index + 1}.
              </span>
              <div>
                <h3 className="mb-2 font-display text-[21px]">{step.title}</h3>
                <p className="m-0 text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
                  {step.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* The one action on this page that works, so it is allowed to be a
        button. */}
    <section className="mx-auto w-full max-w-6xl px-5 pt-4 pb-16 sm:px-8 lg:px-14 lg:pb-20">
      <p className="mb-7 max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
        No form and no application to fill in — an email or a phone call is all
        it takes to start.
      </p>
      <Link
        href="/contact"
        className="inline-flex items-center rounded-full bg-primary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-primary-foreground transition-colors hover:bg-organic-accent-600"
      >
        Get in touch about volunteering
      </Link>
    </section>
  </>
);

export default Page;
