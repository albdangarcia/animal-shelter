"use client";

import clsx from "clsx";
import Link from "next/link";

interface NavLinkItem {
  name: string;
  href: string;
}

interface NavItemsRendererProps {
  links: NavLinkItem[];
  pathname: string;
  showUserProfile: boolean;
  onLinkClick?: () => void; // For mobile menu to close on click
  itemClassName: string; // Base styles — desktop inline vs. mobile full-width row
  activeClassName: string; // Applied to the current page's link
}

const NavItemsRenderer = ({
  links,
  pathname,
  showUserProfile,
  onLinkClick,
  itemClassName,
  activeClassName,
}: NavItemsRendererProps) => {
  return (
    <>
      {links.map((link) =>
        link.name === "Dashboard" && !showUserProfile ? null : (
          <Link
            key={link.name}
            href={link.href}
            onClick={onLinkClick} // Will be undefined for desktop, called for mobile
            className={clsx(
              "transition-colors hover:text-primary",
              itemClassName,
              pathname === link.href && activeClassName
            )}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.name}
          </Link>
        )
      )}
    </>
  );
};

export default NavItemsRenderer;
