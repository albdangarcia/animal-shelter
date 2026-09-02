"use client";

import { useState, useTransition } from "react";
import { togglePetLike } from "@/app/lib/actions/animal.actions";
import { HeartIcon as OutlineHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import LoginPromptModal from "../login-prompt-modal";
import { toast } from "sonner";

interface LikeButtonProps {
  animalId: string;
  currentUserPersonId: string | undefined;
  isLikedByCurrentUser: boolean;
  /**
   * Renders the control as a labelled secondary pill instead of the icon chip
   * PetCard sits on a photo. Presentational only — the toggle logic, the
   * pending state and the login prompt are identical either way. The homepage
   * hero uses it for "Save to favourites"; everywhere else wants the chip.
   */
  label?: string;
}

const LikeButton = ({
  animalId,
  currentUserPersonId,
  isLikedByCurrentUser,
  label,
}: LikeButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const handleLikeClick = () => {
    if (!currentUserPersonId) {
      setIsLoginModalOpen(true);
      return;
    }

    startTransition(async () => {
      const result = await togglePetLike(animalId);

      if (!result.success) {
        toast.error(result.message);
      }
    });
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    handleLikeClick();
  };
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={
          label ?? (isLikedByCurrentUser ? "Unlike this pet" : "Like this pet")
        }
        aria-pressed={isLikedByCurrentUser}
        className={clsx(
          "rounded-full transition-all duration-150 ease-in-out",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          label
            ? "inline-flex items-center gap-2 border border-border px-[22px] py-[13px] font-display text-[15px] leading-[1.2] hover:bg-foreground/[0.07]"
            : // p-3 puts the chip at 44px on touch screens; it drops back
              // to 32px from sm, where it's a pointer target sitting on a photo.
              "bg-background/85 p-3 shadow-organic-sm hover:bg-background sm:p-1.5",
        )}
      >
        {isLikedByCurrentUser ? (
          <SolidHeartIcon className="h-5 w-5 text-primary" />
        ) : (
          <OutlineHeartIcon
            className={clsx(
              "h-5 w-5",
              label ? "text-current" : "text-organic-neutral-600",
            )}
          />
        )}
        {label}
      </button>

      {!currentUserPersonId && (
        <LoginPromptModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          // The dialog portals to <body>, outside the public layout's
          // .theme-organic div, so it has to re-open the scope or its tokens
          // resolve against html.dark.
          className="theme-organic"
        />
      )}
    </>
  );
};

export default LikeButton;
