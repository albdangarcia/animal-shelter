"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, HeartIcon } from "@heroicons/react/24/outline";
import { IconPaw } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import NavItemsRenderer from "./nav-items-renderer";
import UserMenu from "./top-nav-user-avatar";

interface NavLink {
  name: string;
  href: string;
}

interface TopNavProps {
  userImage: string | null | undefined;
  showUserProfile: boolean;
  links: NavLink[];
}

const FAVORITES_HREF = "/pets/favorites";

const TopNav = ({ userImage, showUserProfile, links }: TopNavProps) => {
  const pathname = usePathname();
  // State to control the Sheet component for mobile navigation
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    // bg-organic-accent-100 unconditionally, on every public page — no route
    // check. On the homepage it merges with the hero band into one continuous
    // band, as the mockup draws it; elsewhere it reads as a deliberate header
    // band a shade warmer than the cream below. A usePathname branch would buy
    // nothing and risk a seam.
    <header className="relative z-20 bg-organic-accent-100 px-5 py-[22px] sm:px-8 lg:px-14">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4">
        {/* Hamburger — mobile only, sits left of the brand */}
        <div className="flex items-center min-[915px]:hidden">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 hover:bg-accent hover:text-accent-foreground"
              >
                <span className="sr-only">Open main menu</span>
                <Bars3Icon className="block size-6" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            {/* The sheet portals to <body>, outside the layout's .theme-organic
                div, so it has to re-open the token scope for itself. */}
            <SheetContent
              side="left"
              className="theme-organic gap-6 border-r-border bg-popover p-4 text-foreground"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>
                  Mobile navigation menu with links to different sections of the
                  website.
                </SheetDescription>
              </SheetHeader>

              {/* Brand inside the Sheet */}
              <div className="flex shrink-0 items-center gap-[11px]">
                <span className="grid size-[38px] place-items-center rounded-full bg-primary">
                  <IconPaw className="size-5 text-background" />
                </span>
                <span className="font-display text-[20px]">Pet Adopt</span>
              </div>

              {/* Navigation links inside the Sheet — full-width rows */}
              <div className="flex flex-col gap-1">
                <NavItemsRenderer
                  links={links}
                  pathname={pathname}
                  showUserProfile={showUserProfile}
                  onLinkClick={() => setIsMobileMenuOpen(false)}
                  itemClassName="block rounded-full px-4 py-3 text-base hover:bg-accent"
                  activeClassName="text-organic-accent-800"
                />

                {showUserProfile ? (
                  <Link
                    href={FAVORITES_HREF}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-2 rounded-full px-4 py-3 text-base transition-colors hover:bg-accent hover:text-primary"
                    aria-current={
                      pathname === FAVORITES_HREF ? "page" : undefined
                    }
                  >
                    <HeartIcon className="size-5" aria-hidden="true" />
                    Favorites
                  </Link>
                ) : (
                  <Link
                    href="/sign-in"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="mt-2 block rounded-full border border-border px-4 py-3 text-center font-display text-base transition-colors hover:bg-foreground/[0.07]"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Brand — mr-auto pushes the links and right cluster to the far edge */}
        <Link
          href="/"
          className="mr-auto flex shrink-0 items-center gap-[11px] text-foreground"
        >
          <span className="grid size-[38px] place-items-center rounded-full bg-primary">
            <IconPaw className="size-5 text-background" aria-hidden="true" />
          </span>
          <span className="font-display text-[20px]">Pet Adopt</span>
        </Link>

        {/* Desktop links — right aligned, plain text */}
        <nav className="hidden items-center gap-[26px] min-[915px]:flex">
          <NavItemsRenderer
            links={links}
            pathname={pathname}
            showUserProfile={showUserProfile}
            itemClassName="text-[14.5px]"
            activeClassName="text-organic-accent-800"
          />
        </nav>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-[10px]">
          {showUserProfile && (
            <Link
              href={FAVORITES_HREF}
              aria-label="Favorites"
              aria-current={pathname === FAVORITES_HREF ? "page" : undefined}
              className="hidden size-9 place-items-center rounded-full border border-border transition-colors hover:bg-foreground/[0.07] min-[915px]:grid"
            >
              <HeartIcon className="size-[18px]" aria-hidden="true" />
            </Link>
          )}

          {showUserProfile ? (
            <UserMenu userImage={userImage} />
          ) : (
            <Link
              href="/sign-in"
              className="hidden rounded-full border border-border px-[18px] py-[9px] font-display text-[14px] leading-[1.2] transition-colors hover:bg-foreground/[0.07] min-[915px]:inline-flex"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNav;
