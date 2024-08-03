"use client";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  Bars3Icon,
  LifebuoyIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";

const links = [
  { name: "Home", href: "/" },
  { name: "Pets", href: "/pets" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
  { name: "Dashboard", href: "/dashboard" },
];

export default function TopNav({
  userImage,
  showUserProfile,
}: {
  userImage: string | null | undefined;
  showUserProfile: boolean;
}) {
  const pathname = usePathname();

  return (
    <Disclosure as="nav" className="bg-gray-800 rounded-md">
      {({ open, close }) => (
        <>
          <div className="mx-auto max-w-7xl px-2 md:px-6 lg:px-8">
            <div className="relative flex h-16 items-center justify-between">
              {/* bars menu button */}
              <div className="absolute inset-y-0 left-0 flex items-center md:hidden">
                <DisclosureButton className="relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
                  <span className="absolute -inset-0.5" />
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </DisclosureButton>
              </div>

              <div className="flex flex-1 items-center justify-center md:items-stretch md:justify-start">
                {/* logo */}
                <div className="flex flex-shrink-0 items-center">
                  <LifebuoyIcon className="h-8 w-8 text-green-400" />
                  <span className="text-white font-bold text-xl ml-2">
                    Pet Adopt
                  </span>
                </div>

                {/* top nav links */}
                <div className="hidden md:ml-6 md:block">
                  <div className="flex space-x-4">
                    {links.map((link) =>
                      link.name === "Dashboard" && !showUserProfile ? null : (
                        <Link
                          key={link.name}
                          href={link.href}
                          className={clsx(
                            "rounded-md px-3 py-2 text-sm font-medium",
                            pathname === link.href
                              ? "bg-gray-900 text-white"
                              : "text-gray-300 hover:bg-gray-700 hover:text-white"
                          )}
                          aria-current={
                            pathname === link.href ? "page" : undefined
                          }
                        >
                          {link.name}
                        </Link>
                      )
                    )}
                    {/* If there is no session then show the sign in button */}
                    {!showUserProfile && (
                      <button
                        className="rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                        onClick={() => signIn()}
                      >
                        Sign In
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* user profile menu */}
              {showUserProfile && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 md:static md:inset-auto md:ml-6 md:pr-0">
                  <Menu as="div" className="relative ml-3">
                    <div>
                      <MenuButton className="relative flex rounded-full bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                        <span className="absolute -inset-1.5" />
                        <span className="sr-only">Open user menu</span>
                        {userImage ? (
                          <img
                            src={userImage}
                            className="h-8 w-8 rounded-full"
                            alt="User profile image"
                          />
                        ) : (
                          <span className="h-8 w-8 rounded-full bg-slate-600" />
                        )}
                      </MenuButton>
                    </div>
                    <Transition
                      enter="transition ease-out duration-100"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <MenuItems className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => signOut()}
                              className={clsx(
                                "w-full text-left px-4 py-2 text-sm text-gray-700",
                                { "bg-gray-100": focus }
                              )}
                            >
                              Sign out
                            </button>
                          )}
                        </MenuItem>
                      </MenuItems>
                    </Transition>
                  </Menu>
                </div>
              )}
            </div>
          </div>

          {/* small screen drop down menu */}
          <DisclosurePanel className="sm:hidden">
            <div className="space-y-1 px-2 pb-3 pt-2">
              {links.map((link) =>
                link.name === "Dashboard" && !showUserProfile ? null : (
                  <Link
                    onClick={() => close()}
                    key={link.name}
                    href={link.href}
                    passHref
                    className={clsx(
                      "block rounded-md px-3 py-2 text-base font-medium",
                      pathname === link.href
                        ? "bg-gray-900 text-white"
                        : "text-gray-300 hover:bg-gray-700 hover:text-white"
                    )}
                  >
                    {link.name}
                  </Link>
                )
              )}
              {!showUserProfile && (
                <button
                  className="block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white hover:cursor-pointer"
                  onClick={() => signIn()}
                >
                  Sign In
                </button>
              )}
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
