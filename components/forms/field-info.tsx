"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FieldInfoProps {
  /** The hint text shown inside the popover. */
  children: ReactNode;
  /** Accessible name for the trigger, e.g. "About expected adult size". */
  label: string;
  className?: string;
}

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeToHover(onStoreChange: () => void) {
  const mql = window.matchMedia(HOVER_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

const getHoverSnapshot = () => window.matchMedia(HOVER_QUERY).matches;
const getHoverServerSnapshot = () => false;

/**
 * Small info affordance for a form label. Renders as an icon button that opens
 * a short hint on hover (mouse) or tap (touch).
 *
 * Popover — not Tooltip — is deliberate: Radix tooltips only respond to hover
 * and keyboard focus, so on a touch device the hint would be unreachable.
 *
 * Exactly one interaction model is live at a time, which is what keeps the two
 * from fighting:
 *   - hover devices: mouseenter/mouseleave own the state; click is suppressed.
 *   - touch devices: no hover handlers bound; PopoverTrigger's tap toggle owns
 *     the state.
 *   - keyboard, on both: focus opens, blur closes, Enter/Space still toggles.
 *
 * Note this component is presentational only. It does NOT replace the hint for
 * assistive tech — popover content is unmounted while closed, so a screen
 * reader would never encounter it. Keep the real description in the DOM (see
 * the sr-only FormDescription at each call site) so it stays wired into the
 * field's aria-describedby.
 */
export function FieldInfo({ children, label, className }: FieldInfoProps) {
  const [open, setOpen] = useState(false);
  // Touch devices synthesize a mouseenter on tap, which would race the click
  // and flip the popover open-then-shut. Only bind hover where it's real.
  const canHover = useSyncExternalStore(
    subscribeToHover,
    getHoverSnapshot,
    getHoverServerSnapshot,
  );

  const hoverProps = canHover
    ? {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
      }
    : {};

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          // Without this the button inherits type="submit" from the
          // surrounding <form> and clicking the hint submits the intake.
          type="button"
          aria-label={label}
          // On hover devices, hover is the only thing that drives open state.
          // PopoverTrigger composes its own open-toggle onto onClick, so a
          // mouse click would otherwise close what mouseenter just opened —
          // the classic "flashes open then shut on first click" bug. Radix
          // composes with checkForDefaultPrevented, so preventDefault here
          // suppresses its toggle. detail === 0 means the click came from
          // Enter/Space rather than a pointer, which we still want to work.
          onClick={(event) => {
            if (canHover && event.detail !== 0) event.preventDefault();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          {...hoverProps}
          className={cn(
            "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        // Stops the popover stealing focus from the field the user is filling.
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Without this, closing on mouseleave triggers Radix's default
        // return-focus-to-trigger, which fires the trigger's onFocus and
        // reopens the popover — hover would get stuck open.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="text-muted-foreground w-64 p-3 text-sm leading-snug font-normal"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}