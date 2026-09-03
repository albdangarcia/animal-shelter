import { Mail, Phone } from "lucide-react";

/**
 * A directory, not four boxes: the hairlines carry the structure, so the page
 * renders no card surfaces at all.
 */

const CONTACT_CHANNELS = [
  {
    title: "Volunteer",
    email: "volunteer@example.com",
    phone: "+1 (555) 905-6789",
  },
  {
    title: "Donations",
    email: "donations@example.com",
    phone: "+1 (555) 905-7890",
  },
  {
    title: "Support",
    email: "support@example.com",
    phone: "+1 (555) 905-8901",
  },
  {
    title: "Feedback",
    email: "feedback@example.com",
    phone: "+1 (555) 905-9012",
  },
];

const Page = () => (
  <>
    {/* The same accent band the nav carries, so the two read as one surface */}
    <section className="bg-organic-accent-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
        <h1 className="font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
          Contact
        </h1>
      </div>
    </section>

    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16 lg:px-14">
      {/* Sits under the heading in the band above, so the two read as one
          column on lg. */}
      <p className="max-w-[34ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
        We answer email within two working days — if it&apos;s urgent, or it&apos;s
        about an animal already in our care, the phone is faster.
      </p>

      <ul className="m-0 list-none p-0">
        {CONTACT_CHANNELS.map((channel) => (
          <li
            key={channel.title}
            className="border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0"
          >
            <h2 className="mb-2 font-display text-[21px]">{channel.title}</h2>

            {/* Stacked below 640px; the 44px minimum keeps each link a real
                tap target while they're one under the other. */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7">
              <a
                href={`mailto:${channel.email}`}
                className="inline-flex min-h-11 items-center gap-2 text-[15px] text-primary transition-colors duration-150 hover:text-organic-accent-700 sm:min-h-0"
              >
                <Mail
                  className="size-4 shrink-0 text-organic-neutral-500"
                  aria-hidden="true"
                />
                {channel.email}
              </a>
              <a
                href={`tel:${channel.phone.replace(/[^+\d]/g, "")}`}
                className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground sm:min-h-0"
              >
                <Phone
                  className="size-4 shrink-0 text-organic-neutral-500"
                  aria-hidden="true"
                />
                {channel.phone}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </>
);

export default Page;
