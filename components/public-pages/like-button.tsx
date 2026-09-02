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
}

const LikeButton = ({
  animalId,
  currentUserPersonId,
  isLikedByCurrentUser,
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
        aria-label={isLikedByCurrentUser ? "Unlike this pet" : "Like this pet"}
        className={clsx(
          "p-1.5 rounded-full bg-background/85 hover:bg-background transition-all duration-150 ease-in-out",
          "shadow-organic-sm focus:outline-none focus:ring-2 focus:ring-ring"
        )}
      >
        {isLikedByCurrentUser ? (
          <SolidHeartIcon className="h-5 w-5 text-primary" />
        ) : (
          <OutlineHeartIcon className="h-5 w-5 text-organic-neutral-600" />
        )}
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
