"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface NavLinkItem {
  name: string;
  href: string;
}

interface NavItemsRendererProps {
  links: NavLinkItem[];
  pathname: string;
  showUserProfile: boolean;
  onLinkClick?: () => void; // For mobile menu to close on click
  itemClassName: string; // To pass base styles like "text-sm" or "block text-base"
  signInButtonClassName: string; // For sign-in button specific styles
}

const NavItemsRenderer = ({
  links,
  pathname,
  showUserProfile,
  onLinkClick,
  itemClassName,
  signInButtonClassName,
}: NavItemsRendererProps) => {
  const router = useRouter();

  return (
    <>
      {links.map((link) =>
        link.name === "Dashboard" && !showUserProfile ? null : (
          <Link
            key={link.name}
            href={link.href}
            onClick={onLinkClick} // Will be undefined for desktop, called for mobile
            passHref={!!onLinkClick} // passHref if onLinkClick is provided (typically for mobile)
            className={clsx(
              "rounded-md px-4 py-2 font-medium",
              itemClassName,
              pathname === link.href
                ? "bg-gray-900 text-white"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            )}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.name}
          </Link>
        )
      )}
      {!showUserProfile && (
        <button
          className={clsx(
            "rounded-md px-3 py-2 font-medium text-gray-300 hover:bg-gray-700 hover:text-white w-full cursor-pointer",
            signInButtonClassName,
            !!onLinkClick && "hover:cursor-pointer"
          )}
          onClick={() => {
            router.push("/sign-in");
            if (onLinkClick) {
              // If mobile, also close the panel
              onLinkClick();
            }
          }}
        >
          Sign In
        </button>
      )}
    </>
  );
};

export default NavItemsRenderer;
