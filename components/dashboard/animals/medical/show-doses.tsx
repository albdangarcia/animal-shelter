"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";

/**
 * Every day of an order's run, behind a toggle: a long course would bury the
 * page. Shut until asked for.
 */
export function ShowDoses({ days, children }: { days: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (days === 0) return null;
  return (
    <div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide" : "Show"} every dose ({days} {days === 1 ? "day" : "days"})
        <ChevronDown className={clsx("ml-1 size-4 transition-transform", open && "rotate-180")} />
      </Button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
