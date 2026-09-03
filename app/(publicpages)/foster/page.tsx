import Link from "next/link";

/**
 * Marketing page — no data of its own, so it stays a plain server component.
 *
 * The CTA links straight into /dashboard/my-foster-application without an auth
 * check: the dashboard layout already redirects a signed-out visitor to
 * /sign-in, so guarding here would only duplicate that a step earlier.
 */

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Tell us about your home",
    copy: "A short application covering your space, your hours and anyone else — human or animal — already living there.",
  },
  {
    number: "02",
    title: "We match you",
    copy: "A puppy needing round-the-clock feeding and a cat recovering from surgery want very different homes. We pair you with an animal that suits yours.",
  },
  {
    number: "03",
    title: "They come home with you",
    copy: "Usually two to eight weeks, sometimes longer. We stay in touch the whole time, and you can call us at any hour.",
  },
];

const WHAT_WE_COVER = [
  {
    title: "Food",
    copy: "Whatever your foster animal is already eating, supplied by us for as long as they stay.",
  },
  {
    title: "Kit",
    copy: "Crate, bedding, bowls, litter tray, leads and toys. Return what you don't use.",
  },
  {
    title: "Vet bills",
    copy: "Every appointment, medication and procedure, routine or emergency. You never pay a vet.",
  },
];

const Page = () => (
  <>
    {/* Hero — the same accent band the nav carries, so the two read as one */}
    <section className="bg-organic-accent-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
        <p className="mb-5 text-[13.5px] text-organic-accent-700">
          Foster with us
        </p>
        <h1 className="mb-5 max-w-[14ch] font-display text-[clamp(44px,8vw,84px)] leading-[0.96] tracking-[-0.025em]">
          A few weeks changes everything
        </h1>
        <p className="mb-8 max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
          A foster home is quieter than a shelter, and an animal who has somewhere
          calm to wait recovers faster and shows more of who they really are. You
          give the room and the routine. We cover everything else.
        </p>
        <Link
          href="/dashboard/my-foster-application"
          className="inline-flex items-center rounded-full bg-primary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-primary-foreground transition-colors hover:bg-organic-accent-600"
        >
          Apply to foster
        </Link>
      </div>
    </section>

    <section
      aria-labelledby="how-it-works-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <h2 id="how-it-works-heading" className="mb-8 font-display text-[36px]">
        How it works
      </h2>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {HOW_IT_WORKS.map((step) => (
          <div key={step.number}>
            <div className="mb-2 font-display text-[13px] text-organic-accent-700">
              {step.number}
            </div>
            <h3 className="mb-2 font-display text-[19px]">{step.title}</h3>
            <p className="text-[14px] leading-[1.6] text-organic-neutral-800">
              {step.copy}
            </p>
          </div>
        ))}
      </div>
    </section>

    <section
      aria-labelledby="what-we-cover-heading"
      className="mx-auto w-full max-w-6xl px-5 pt-4 pb-10 sm:px-8 lg:px-14 lg:pb-14"
    >
      <div className="grid gap-10 rounded-[28px] bg-organic-sage-100 p-8 sm:grid-cols-2 sm:p-11 lg:grid-cols-[0.9fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <h2
          id="what-we-cover-heading"
          className="max-w-[9ch] font-display text-[32px]"
        >
          What we cover
        </h2>

        {WHAT_WE_COVER.map((item) => (
          <div key={item.title}>
            <h3 className="mb-2 font-display text-[19px]">{item.title}</h3>
            <p className="text-[14px] leading-[1.6] text-organic-neutral-800">
              {item.copy}
            </p>
          </div>
        ))}
      </div>
    </section>

    <section className="mx-auto w-full max-w-6xl px-5 pt-4 pb-16 text-center sm:px-8 lg:px-14 lg:pb-20">
      <h2 className="mb-3 font-display text-[32px]">Ready when you are</h2>
      <p className="mx-auto mb-7 max-w-[48ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
        The application takes about ten minutes. Nothing is binding — we&apos;ll
        talk it through with you before any animal moves in.
      </p>
      <div className="flex flex-wrap justify-center gap-3.5">
        <Link
          href="/dashboard/my-foster-application"
          className="inline-flex items-center rounded-full bg-primary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-primary-foreground transition-colors hover:bg-organic-accent-600"
        >
          Apply to foster
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center rounded-full border border-border px-[26px] py-[13px] font-display text-[15px] leading-[1.2] transition-colors hover:bg-foreground/[0.07]"
        >
          Ask us a question
        </Link>
      </div>
    </section>
  </>
);

export default Page;
