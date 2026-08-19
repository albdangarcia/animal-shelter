import Link from "next/link";
import { signOut } from "next-auth/react";
import { BellIcon } from "@heroicons/react/24/outline";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserAvatarProps {
  userImage?: string | null;
}

const UserMenu = ({ userImage }: UserAvatarProps) => {
  return (
    <div className="flex items-center gap-x-4">
      <Button
        size="icon"
        aria-label="View notifications"
        className="bg-transparent hover:bg-white text-gray-200 hover:text-gray-700"
      >
        <BellIcon className="size-5" />
      </Button>

      {/* User Dropdown Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <span className="sr-only">Open user menu</span>
            <Avatar className="h-8 w-8">
              <AvatarImage src={userImage || ""} alt="User profile image" />
              <AvatarFallback className="bg-slate-600">
                <User className="size-4 text-gray-200" />
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align="end" forceMount>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/dashboard/account">Account</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => signOut()}
            className="cursor-pointer"
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default UserMenu;
