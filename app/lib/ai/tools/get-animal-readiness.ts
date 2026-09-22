import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor, type Actor } from "@/app/lib/auth/actor";
import { can } from "@/app/lib/auth/can";
import { _fetchAnimalReadinessForAssistant } from "@/app/lib/data/animals/readiness.data";
import type { ReadinessViewerCan } from "@/app/lib/readiness/board";
import { actorContextSchema } from "../context";
import {
  toAnimalReadinessView,
  type AnimalReadinessView,
} from "../projections/animal-readiness";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

// All three reads, as the readiness board and panel require: outstanding
// items come from assessments and characteristic claims as well as the
// animal record.
export const GET_ANIMAL_READINESS_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
];

/** What this actor may change — decides whether each item's next step
 *  is the fix itself or only a look at the page where it's made. */
export const readinessViewerCanFor = (actor: Actor): ReadinessViewerCan => ({
  manageAssessments: can(actor.role, AppPermissions.ANIMAL_ASSESSMENT_MANAGE),
  manageAnimalInfo: can(actor.role, AppPermissions.ANIMAL_INFO_MANAGE),
  managePhotos: can(actor.role, AppPermissions.ANIMAL_PHOTO_MANAGE),
});

export const getAnimalReadinessTool = tool({
  description:
    "Get what is still outstanding before one animal is fully ready for " +
    "adoption, by id. Use this for questions like \"is Buddy ready for " +
    "adoption\", \"what does Juniper still need\", or \"what's left to do " +
    "for her\". Requires an animal id — resolve a name with findAnimals " +
    "first. `status` is READY (nothing outstanding), NOT_READY, or " +
    "ARCHIVED (the animal has left the shelter — adopted, transferred or " +
    "deceased — so readiness does not apply; say that rather than calling " +
    "it ready or not ready). Readiness is advisory: it reports the " +
    "shelter's checklist, and nothing in the app stops an animal with " +
    "outstanding items from being listed or adopted. Never say an item must " +
    "be cleared before the animal can be listed or adopted, and do not call " +
    "the animal blocked. If `listingStatus` is PUBLISHED or " +
    "PENDING_ADOPTION, say the animal is already listed and these items are " +
    "still open. When NOT_READY, `outstanding` is already sorted most " +
    "urgent first — report every item, in the order given. Each item's " +
    "`kind` is one of: ESCALATED_FINDING (the latest check of that " +
    "assessment was escalated), ACUTE_HEALTH, UNSUPPORTED_CHARACTERISTIC (a " +
    "trait on the profile that the assessments contradict or no longer back " +
    "up), MISSING_ASSESSMENT (a required check with nothing on file), " +
    "NOT_SPAYED_NEUTERED, NO_PHOTO. `description` says which one; " +
    "`nextStep` is what the person asking can do about it — relay it as " +
    "written. How long is already worked out: `daysOutstanding` is whole " +
    "days (0 means since today) — state it as given and never compute " +
    "durations from dates yourself. A null `daysOutstanding` means nothing " +
    "records when that item began: say it is not dated, do not guess. The " +
    "top-level `daysOutstanding` is how long the animal has had anything " +
    "outstanding at all.",
  inputSchema: z.object({
    animalId: z
      .string()
      .describe("Animal id from findAnimals or getAttentionQueue."),
  }),
  contextSchema: actorContextSchema,
  async execute(
    { animalId },
    { context },
  ): Promise<ToolResult<{ readiness: AnimalReadinessView }>> {
    try {
      for (const permission of GET_ANIMAL_READINESS_PERMISSIONS) {
        requireFor(context, permission);
      }
      const readiness = await _fetchAnimalReadinessForAssistant(animalId);
      if (!readiness) {
        return toolFailure(
          `No animal found with id "${animalId}". Use findAnimals to look it up by name.`,
        );
      }
      return {
        ok: true,
        readiness: toAnimalReadinessView(
          readiness,
          readinessViewerCanFor(context),
          new Date(),
          (await getShelterSettings()).timezone,
        ),
      };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
