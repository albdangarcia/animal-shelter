"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type {
  CharacteristicSuggestion,
  SupersededFinding,
} from "@/app/lib/assessments/proposals";
import { applyCharacteristicSuggestion } from "@/app/lib/actions/animal-assessment.actions";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import { Button } from "@/components/ui/button";
import { FindingsAgainst } from "@/components/dashboard/animals/characteristics/findings-against";
import { cn } from "@/lib/utils";

interface Props {
  animalId: string;
  assessmentId: string;
  suggestions: CharacteristicSuggestion[];
  /** This assessment's own contradicting findings that newer findings
   *  overtook. */
  superseded: SupersededFinding[];
  /** Without it the section is read-only. */
  canManage: boolean;
}

const actionLabel = (action: CharacteristicSuggestion["action"]) =>
  action === "ADD" ? "Add to animal" : "Cite this assessment";

export function AssessmentSuggestions({
  animalId,
  assessmentId,
  suggestions,
  superseded,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const apply = (suggestion: CharacteristicSuggestion) => {
    setSubmittingId(suggestion.characteristicId);
    startTransition(async () => {
      const result = await applyCharacteristicSuggestion({
        assessmentId,
        animalId,
        characteristicId: suggestion.characteristicId,
      });
      setSubmittingId(null);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      // Either way, refresh: a stale suggestion (the trait was re-sourced
      // elsewhere since the page loaded) needs the current state re-shown.
      router.refresh();
    });
  };

  if (suggestions.length === 0 && superseded.length === 0) return null;

  return (
    <div className="space-y-5">
      {suggestions.length > 0 && (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <li key={s.characteristicId} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{s.characteristicName}</p>
                  <p className="text-xs text-muted-foreground">
                    From “{s.fieldLabel}”: {s.answerValue}
                  </p>
                  {s.contradictions.length > 0 && (
                    <p className="text-xs font-medium text-destructive">
                      <FindingsAgainst
                        animalId={animalId}
                        findings={s.contradictions}
                      />
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => apply(s)}
                  >
                    {isPending && submittingId === s.characteristicId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {actionLabel(s.action)}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {superseded.length > 0 && (
        <ul className={cn("space-y-2", suggestions.length > 0 && "pt-1")}>
          {superseded.map((s) => (
            <li
              key={`${s.characteristicId}:${s.fieldKey}`}
              className="text-xs text-muted-foreground"
            >
              “{s.fieldLabel}”: {s.answerValue} — superseded for{" "}
              {s.characteristicName} by the{" "}
              <Link
                href={`/dashboard/animals/${animalId}/assessments/${s.supersededBy.assessmentId}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                {s.supersededBy.templateName} of{" "}
                {formatDateToLongString(new Date(s.supersededBy.observedAt))}
              </Link>
              , so it no longer counts against it.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
