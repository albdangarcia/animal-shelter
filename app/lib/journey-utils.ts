import { AnimalJourneyLogPayload } from "./data/animals/animal-journey.data";
import { AnimalActivityType } from "@/prisma/generated/enums";

export const formatJourneyItem = (
  item: AnimalJourneyLogPayload,
): { title: string; description: string } | null => {
  const animalName = item.animal?.name || "The animal";

  switch (item.activityType) {
    case AnimalActivityType.CREATED:
    case AnimalActivityType.INTAKE_PROCESSED:
      const intakeType = item.animal?.intake[0]?.type;
      let title = "Incoming Event"; // Default title
      switch (intakeType) {
        case "OWNER_SURRENDER":
          title = "Intake: Owner Surrender";
          break;
        case "STRAY":
          title = "Intake: Stray";
          break;
        case "TRANSFER_IN":
          title = "Intake: Transfer";
          break;
        case "BORN_IN_CARE":
          title = "Intake: Born in Care";
          break;
        case "SEIZE":
          title = "Intake: Legal Seizure";
          break;
        case "SERVICE_IN":
          title = "Intake: Temporary Service";
          break;
        case "ACO_IMPOUND":
          title = "Intake: ACO Impound";
          break;
      }
      return {
        title: title,
        description: `${animalName} was admitted to the shelter.`,
      };

    case AnimalActivityType.STATUS_CHANGE:
      return {
        title: "Status Change",
        description:
          item.changeSummary || `The animal's adoption status was updated.`,
      };

    case AnimalActivityType.FOSTER_PLACED:
      return {
        title: "Foster: Placed",
        description:
          item.changeSummary || `${animalName} was placed with a foster.`,
      };

    case AnimalActivityType.FOSTER_RETURNED:
      return {
        title: "Foster: Returned",
        description:
          item.changeSummary || `${animalName} was returned from foster care.`,
      };

    case AnimalActivityType.OUTCOME_PROCESSED:
      const outcomeType = item.animal?.Outcome[0]?.type;

      switch (outcomeType) {
        case "ADOPTION":
          return {
            title: "Outcome: Adopted",
            description: `${animalName} has been adopted and left the shelter.`,
          };
        case "TRANSFER_OUT":
          return {
            title: "Outcome: Transferred",
            description: `${animalName} was transferred to a partner organization.`,
          };
        case "RETURN_TO_OWNER":
          return {
            title: "Outcome: Returned to Owner",
            description: `${animalName} has been returned to their owner.`,
          };
        case "DECEASED":
          return {
            title: "Outcome: Deceased",
            description: `${animalName}'s journey at the shelter has ended.`,
          };
        case "EUTHANIZED":
          return {
            title: "Outcome: Euthanized",
            description: `${animalName}'s journey at the shelter has ended.`,
          };
        default:
          return {
            title: "Outcome Event",
            description: `${animalName} has left the shelter.`,
          };
      }

    // No TASK_* cases by design: fetchAnimalJourney (animal-journey.data.ts)
    // filters to lifecycle events only, so TASK_CREATED / TASK_STATUS_CHANGED /
    // TASK_UPDATED / TASK_ASSIGNED never reach this function. Task activity
    // shows on the animal's Activity feed, not its Journey timeline.
    default:
      return null;
  }
};
