"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
interface TabLink {
  href: string;
  label: string;
}

interface LinkTabsProps {
  links: TabLink[];
  className?: string;
  scrollable?: boolean;
}

export function LinkTabs({ links, className, scrollable = false }: LinkTabsProps) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Find the link whose href is the longest prefix of the current pathname.
  const activeLink = links
    .filter((link) => pathname.startsWith(link.href))
    .reduce(
      (bestMatch, currentLink) =>
        currentLink.href.length > bestMatch.href.length
          ? currentLink
          : bestMatch,
      { href: "", label: "" }
    );

  useEffect(() => {
    const scroller = scrollRef.current;
    const tabs = tabsRef.current;
    if (!scrollable || !scroller || !tabs) return;

    const updateEdges = () => {
      const left = scroller.scrollLeft > 1;
      const right = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1;
      setEdges((previous) => previous.left === left && previous.right === right
        ? previous : { left, right });
    };
    const revealActive = () => {
      const active = tabs.querySelector<HTMLElement>('[aria-current="page"]');
      if (active) {
        const viewport = scroller.getBoundingClientRect();
        const rect = active.getBoundingClientRect();
        // Keep the selected label clear of the overflow fades; scroll only this row.
        if (rect.left < viewport.left + 24) {
          scroller.scrollBy({ left: rect.left - viewport.left - 24 });
        } else if (rect.right > viewport.right - 24) {
          scroller.scrollBy({ left: rect.right - viewport.right + 24 });
        }
      }
      updateEdges();
    };
    const observer = new ResizeObserver(revealActive);
    observer.observe(scroller);
    observer.observe(tabs);
    scroller.addEventListener("scroll", updateEdges, { passive: true });
    revealActive();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", updateEdges);
    };
  }, [activeLink.href, scrollable]);

  const tabs = (
    <div
      ref={tabsRef}
      className={cn(
        "bg-muted inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
    >
      {links.map((link) => {
        const isActive = link.href === activeLink.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-foreground dark:text-muted-foreground",
              "inline-flex items-center justify-center whitespace-nowrap",
              "rounded-md border border-transparent px-2 py-1 text-sm font-medium",
              "transition-[color,box-shadow]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              {
                "bg-background text-foreground dark:text-foreground shadow-sm":
                  isActive,
              }
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );

  if (!scrollable) return tabs;

  return (
    <div className="relative w-fit max-w-full min-w-0">
      <div ref={scrollRef} className="overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs}
      </div>
      {edges.left && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg bg-gradient-to-r from-background to-transparent" />}
      {edges.right && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-background to-transparent" />}
    </div>
  );
}
