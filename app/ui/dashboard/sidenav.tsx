import Link from "next/link";
import NavLinks from "@/app/ui/dashboard/navlinks";
import { PowerIcon, LifebuoyIcon } from "@heroicons/react/24/outline";
import { signOut } from "@/auth";

export default function SideNav() {
  return (
    <div className="flex h-full flex-col px-3 py-4 md:px-2 border-r border-slate-200">
      {/* pet adopt logo */}
      <Link
        className="mb-2 rounded-md flex h-15 items-end justify-center p-4 md:h-15 border-b-2 bg-gray-800 text-white"
        href="/"
      >
        <div className="flex w-32 md:w-40 text-xl font-medium items-center justify-cente">
          <LifebuoyIcon className="h-7 w-7" />
          <div className="pl-2">PetAdopt</div>
        </div>
      </Link>

      {/* left nav links */}
      <div className="flex grow flex-row justify-between space-x-2 lg:flex-col lg:space-x-0 lg:space-y-2">
        <NavLinks />
        {/* expander */}
        <div className="hidden h-auto w-full grow rounded-md lg:block"></div>
        {/* sign out button */}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-gray-800 hover:text-white lg:flex-none lg:justify-start lg:p-2 lg:px-3">
            <PowerIcon className="w-6" />
            <div className="hidden md:block">Sign Out</div>
          </button>
        </form>
      </div>
    </div>
  );
}
