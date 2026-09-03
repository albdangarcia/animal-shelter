import Link from "next/link";

/**
 * Marketing page — no data of its own, so it stays a plain server component.
 *
 * There is no payment integration, so this page renders no "Donate now"
 * button. A dead primary action teaches people the site is broken; bank
 * transfer and giving in person are things someone can actually do today, so
 * those two are the page's content rather than a footnote under a disabled
 * CTA. Anything else routes to /contact as a sentence, not a button.
 *
 * The $75 line matches components/public-pages/home/help-panel.tsx word for
 * word — the homepage and this page must not disagree about what a figure
 * buys. If one changes, change both.
 */

const WHAT_YOUR_MONEY_DOES = [
  {
    amount: "$30",
    copy: "Feeds one animal for a month, including the prescription diets some of them need.",
  },
  {
    amount: "$75",
    copy: "Covers a full course of vaccinations for one animal in our care.",
  },
  {
    amount: "$250",
    copy: "Pays for a spay or neuter, a microchip, and the recovery care that follows.",
  },
];

// Deliberately unmistakable: a routing number of all zeros and a sequential
// account number can't be mistaken for real ones, and the notice above them
// says so in words. Nobody should be able to send money into the void from
// this page.
const BANK_DETAILS = [
  { label: "Account name", value: "Pet Adopt (example account)" },
  { label: "Routing number", value: "000000000" },
  { label: "Account number", value: "12345678" },
];

const Page = () => (
  <>
    {/* The same accent band the nav carries, so the two read as one surface.
        No CTA in the band — there is nothing for it to do. */}
    <section className="bg-organic-accent-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
        <h1 className="mb-5 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
          Donate
        </h1>
        <p className="max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
          Everything given goes into the animals in our care — food, vaccinations,
          surgery, and the weeks of quiet recovery that come after.
        </p>
      </div>
    </section>

    <section
      aria-labelledby="what-your-money-does-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <h2
        id="what-your-money-does-heading"
        className="mb-7 font-display text-[32px]"
      >
        What your money does
      </h2>

      {/* Hairline rows, not cards, and not numbered — three amounts are a set,
          not a sequence, so the homepage panel's 01/02/03 device would be
          wrong here. The amount carries the emphasis instead. */}
      <dl className="m-0">
        {WHAT_YOUR_MONEY_DOES.map((tier) => (
          <div
            key={tier.amount}
            className="grid gap-1 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-baseline sm:gap-8"
          >
            <dt className="font-display text-[32px] leading-[1.1] text-organic-accent-700">
              {tier.amount}
            </dt>
            <dd className="m-0 max-w-[52ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
              {tier.copy}
            </dd>
          </div>
        ))}
      </dl>
    </section>

    <section
      aria-labelledby="how-to-give-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <h2 id="how-to-give-heading" className="mb-7 font-display text-[32px]">
        How to give
      </h2>

      {/* The page's real content, so it gets the most room. */}
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h3 className="mb-3 font-display text-[21px]">Bank transfer</h3>

          <p className="mb-2">
            <span className="inline-flex items-center rounded-full bg-organic-accent-200 px-3.5 py-[5px] text-[12.5px] tracking-[0.02em] text-organic-accent-800">
              Example details
            </span>
          </p>
          <p className="mb-5 max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
            This is a demonstration site and the numbers below are placeholders.
            They are not a real account, and a transfer sent to them will not
            reach anybody.
          </p>

          <dl className="m-0 mb-5">
            {BANK_DETAILS.map((detail) => (
              <div
                key={detail.label}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3 last:border-b-0"
              >
                <dt className="text-[15px] text-muted-foreground">
                  {detail.label}
                </dt>
                <dd className="m-0 text-[15px] tracking-[0.02em] text-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
            Put your name in the reference so we know who to thank. If the gift
            is for a particular animal, add their name after yours.
          </p>
        </div>

        <div>
          <h3 className="mb-3 font-display text-[21px]">In person</h3>
          <p className="mb-5 max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
            Come to the front desk any day we are open. Cash, card and cheques
            are all fine, and you can ask for a receipt on the spot.
          </p>

          {/* Address and hours match footer.tsx exactly. */}
          <dl className="grid gap-8 sm:grid-cols-2 sm:gap-10">
            <div>
              <dt className="mb-2 font-display text-[12px] tracking-[0.08em] text-organic-neutral-500 uppercase">
                Address
              </dt>
              <dd className="m-0 text-[17px] leading-[1.6] text-organic-neutral-800">
                248 Rescue Way
                <br />
                Brooklyn, NY 11201
              </dd>
            </div>

            <div>
              <dt className="mb-2 font-display text-[12px] tracking-[0.08em] text-organic-neutral-500 uppercase">
                Opening hours
              </dt>
              <dd className="m-0 text-[17px] leading-[1.6] text-organic-neutral-800">
                Wednesday to Sunday
                <br />
                11am – 6pm
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    {/* A sentence, not a button — there is no form behind any of this. */}
    <section className="mx-auto w-full max-w-6xl px-5 pt-4 pb-16 sm:px-8 lg:px-14 lg:pb-20">
      <p className="max-w-[56ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
        Giving regularly, a gift in memory of someone, or leaving something to
        us in your will — all of it is easier than it sounds, and we will walk
        you through it.{" "}
        <Link href="/contact" className="text-organic-accent-700 hover:underline">
          Get in touch
        </Link>{" "}
        and ask for the donations team.
      </p>
    </section>
  </>
);

export default Page;
