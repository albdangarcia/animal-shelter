"use client";

import { useState, useTransition } from "react";
import { toggleAnimalFavorite } from "@/app/lib/actions/animal.actions";
import { IconHeart, IconHeartFilled } from "@tabler/icons-react";
import clsx from "clsx";
import LoginPromptModal from "../login-prompt-modal";
import { toast } from "sonner";

interface FavoriteButtonProps {
  animalId: string;
  currentUserPersonId: string | undefined;
  isFavoritedByCurrentUser: boolean;
  /**
   * Renders the control as a labelled secondary pill instead of the icon chip
   * PetCard sits on a photo. Presentational only — the toggle logic, the
   * pending state and the login prompt are identical either way. The homepage
   * hero uses it for "Save to favorites"; everywhere else wants the chip.
   */
  label?: string;
}

const FavoriteButton = ({
  animalId,
  currentUserPersonId,
  isFavoritedByCurrentUser,
  label,
}: FavoriteButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const handleFavoriteClick = () => {
    if (!currentUserPersonId) {
      setIsLoginModalOpen(true);
      return;
    }

    startTransition(async () => {
      const result = await toggleAnimalFavorite(animalId);

      if (!result.success) {
        toast.error(result.message);
      }
    });
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    handleFavoriteClick();
  };
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={
          label ??
          (isFavoritedByCurrentUser
            ? "Remove from favorites"
            : "Add to favorites")
        }
        aria-pressed={isFavoritedByCurrentUser}
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
        {isFavoritedByCurrentUser ? (
          <IconHeartFilled className="h-5 w-5 text-primary" />
        ) : (
          <IconHeart
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

export default FavoriteButton;
