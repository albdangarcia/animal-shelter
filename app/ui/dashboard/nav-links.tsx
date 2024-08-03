"use client";
import {
  HomeIcon,
  ListBulletIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Nav links
const links = [
  { name: "Home", href: "/dashboard", icon: HomeIcon },
  {
    name: "Pets",
    href: "/dashboard/pets",
    icon: ListBulletIcon,
  },
  { name: "Users", href: "/dashboard/users", icon: ClipboardDocumentListIcon },
];

export default function NavLinks({ userRole }: { userRole: string | undefined }) {
  // Get the current pathname
  const pathname = usePathname();

  // Filter out the button links if the user is not an admin
  const filteredLinks = links.filter(link => {
    if (userRole !== 'admin' && link.name === 'Users') {
      return false;
    }
    return true;
  });
  
  return (
    <>
      {filteredLinks.map((link) => {
        // Button Icon
        const LinkIcon = link.icon;
        return (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              "flex h-[48px] grow items-center justify-center gap-2 rounded-md p-3 text-sm font-medium border hover:border-slate-400 lg:flex-none lg:justify-start lg:p-2 lg:px-3",
              {
                "bg-slate-200 text-slate-900 border-none":
                  pathname === link.href,
              }
            )}
          >
            <LinkIcon className="w-6" />
            <p className="hidden lg:block">{link.name}</p>
          </Link>
        );
      })}
    </>
  );
}
