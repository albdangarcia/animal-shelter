"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

const GITHUB_REPO_URL = "https://github.com/albdangarcia/animal-shelter";
const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "7dJbys5@?tMA";

/**
 * The `1c` chip from the design-doc annotations: mono, 10.5px/600, a 10% ink
 * fill and a 5px radius. `select-all` so one click grabs the whole credential.
 */
const Chip = ({ children }: { children: ReactNode }) => (
  <code className="inline-flex select-all items-center rounded-[5px] bg-foreground/10 px-1.75 py-0.75 align-middle font-mono text-[10.5px] font-semibold leading-normal tracking-normal text-foreground">
    {children}
  </code>
);

const DemoBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  // Deliberately component state, not storage: the banner returns on refresh.
  if (dismissed) return null;

  return (
    // `px-5 sm:px-8 lg:px-14` to match the outer padding of the header exactly
    <div
      role="region"
      aria-label="Demo site notice"
      className="theme-organic w-full border-b border-border bg-card px-5 py-3 text-card-foreground sm:px-8 lg:px-14"
      style={{
        boxShadow:
          "inset 0 -10px 14px -14px color-mix(in srgb, var(--foreground) 38%, transparent)",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground px-1.75 py-0.75 text-background">
              <Info className="size-3" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-semibold leading-[1.2]">Heads Up!</p>
          </div>

          <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-foreground/60">
            Data is for demonstration purposes only.
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[1.6] text-foreground/60">
            Sign in as an admin with <Chip>{DEMO_EMAIL}</Chip> and{" "}
            <Chip>{DEMO_PASSWORD}</Chip>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" className="bg-black">
            <Link
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap"
            >
              <IconBrandGithub className="mr-2 size-4" />
              GitHub
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss demo notice"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DemoBanner;