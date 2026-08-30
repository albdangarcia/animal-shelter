"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
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
import { ThemeToggle } from "@/components/light-dark-theme/theme-toggle";
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

const TopNav = ({ userImage, showUserProfile, links }: TopNavProps) => {
  const pathname = usePathname();
  // State to control the Sheet component for mobile navigation
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-gray-800 z-20 relative rounded-md mx-auto w-full max-w-7xl mb-4">
      <div className="mx-auto max-w-7xl px-2 min-[915px]:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-x-2">
          {/* Left cluster: hamburger (mobile only) + logo + desktop links */}
          <div className="flex min-w-0 flex-1 items-center">
            {/* Hamburger — in normal flow so the logo sits right beside it */}
            <div className="flex items-center min-[915px]:hidden">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:bg-gray-700 hover:text-white"
                  >
                    <span className="sr-only">Open main menu</span>
                    <Bars3Icon className="block size-6" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="bg-gray-800 text-white border-r-gray-700 p-4"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle className="text-white">Menu</SheetTitle>
                    <SheetDescription className="sr-only">
                      Mobile navigation menu with links to different sections of
                      the website.
                    </SheetDescription>
                  </SheetHeader>
                  {/* Logo inside the Sheet */}
                  <div className="flex shrink-0 items-center">
                    <IconPaw className="h-6 w-6" />
                    <span className="text-white font-bold text-xl ml-2">
                      Pet Adopt
                    </span>
                  </div>

                  {/* Navigation links inside the Sheet */}
                  <div className="space-y-1">
                    <NavItemsRenderer
                      links={links}
                      pathname={pathname}
                      showUserProfile={showUserProfile}
                      onLinkClick={() => setIsMobileMenuOpen(false)}
                      itemClassName="block text-base"
                      signInButtonClassName="block text-base"
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Logo — left aligned, sits next to the hamburger on mobile */}
            <div className="flex shrink-0 items-center ml-2 min-[915px]:ml-0">
              <IconPaw className="h-6 w-6 text-white" />
              <span className="text-white font-bold text-xl ml-2">
                Pet Adopt
              </span>
            </div>

            {/* Top nav links for desktop */}
            <div className="hidden min-[915px]:ml-6 min-[915px]:flex min-[915px]:space-x-2">
              <NavItemsRenderer
                links={links}
                pathname={pathname}
                showUserProfile={showUserProfile}
                itemClassName="text-sm"
                signInButtonClassName="text-sm"
              />
            </div>
          </div>

          {/* Right-side controls — always visible */}
          <div className="flex shrink-0 items-center gap-x-4">
            <ThemeToggle className="bg-transparent hover:bg-white! text-gray-200 hover:text-gray-700" />

            {/* User profile menu */}
            {showUserProfile && <UserMenu userImage={userImage} />}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;