"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addCharacteristicFromCondition } from "@/app/lib/actions/medical-condition.actions";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

interface Props {
  conditionId: string;
  characteristicName: string;
  /** ADD: the animal doesn't carry the trait. CITE: it does, from elsewhere. */
  state: "ADD" | "CITE";
  /** Where focus goes once the trait cites the condition and the button goes. */
  fallbackId?: string;
}

/**
 * Puts the trait a condition stands for on the animal, or makes the trait
 * already there cite this condition. Done, the button goes, and focus moves
 * on rather than to the page.
 */
export function ConditionTraitButton({
  conditionId,
  characteristicName,
  state,
  fallbackId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Moves focus on when the button leaves while it has focus.
  const { triggerRef } = useEntryDialogFocus(fallbackId);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {state === "CITE" && (
        <span className="text-muted-foreground">
          {characteristicName} is on the animal from another source.
        </span>
      )}
      {/* Not `disabled` while pending: a focused button that is disabled
          loses focus to the page before it goes. */}
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={isPending}
        onClick={() => {
          if (isPending) return;
          startTransition(async () => {
            const result = await addCharacteristicFromCondition(conditionId);
            if (result.ok) {
              toast.success(result.message);
              return;
            }
            toast.error(result.message);
            // Refused because the condition or the trait changed meanwhile:
            // show them as they now are.
            router.refresh();
          });
        }}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Tag className="mr-2 h-4 w-4" />
        )}
        {state === "ADD" ? `Add ${characteristicName} to the animal` : "Cite this condition"}
      </Button>
    </div>
  );
}
