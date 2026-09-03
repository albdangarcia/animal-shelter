"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Lock, LogIn } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Merged into DialogContent. The dialog portals to <body>, so a caller inside
   * a token scope (the public pages' `.theme-organic`) has to re-open it here —
   * that decision belongs at the call site, since this modal is shared and a
   * dashboard caller must keep inheriting the dashboard's theme.
   */
  className?: string;
}

const LoginPromptModal = ({
  isOpen,
  onClose,
  className,
}: LoginPromptModalProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // usePathname() drops the query string, so /pets?page=2 comes back as
  // /pets. Rebuild it so the user lands back on the same page of results.
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  return (
    // Radix portals DialogContent to <body>, but React events still propagate
    // through the React tree — so a click inside the dialog (the X, Cancel, the
    // backdrop) bubbles up through whatever rendered this modal. LikeButton
    // lives inside PetCard's <Link>, so every dismissal was navigating to the
    // pet. Contain it here rather than at each call site: stop click and
    // keydown from escaping the modal's React subtree without preventing
    // default, so the "Sign in" link still navigates and Radix still closes.
    // (Escape is a document-level listener in Radix and never bubbled here, but
    // guarding keydown too costs nothing.)
    <span
      style={{ display: "contents" }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className={cn("sm:max-w-[425px]", className)}>
          <DialogHeader>
            <DialogTitle className="flex items-center pr-8">
              <Lock className="mr-2 h-5 w-5 text-primary" />
              Login Required
            </DialogTitle>
            <DialogDescription>
              You need to be logged in to like pets and save your favorites.
              Please log in or create an account to continue.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>

            <Button asChild onClick={onClose}>
              <Link
                href={`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`}
              >
                <LogIn className="mr-2 h-5 w-5" />
                Login / Sign Up
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
};

export default LoginPromptModal;
