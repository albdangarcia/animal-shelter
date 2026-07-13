import { fetchAnimalJourney } from "@/app/lib/data/animals/animal-journey.data";
import { formatJourneyItem } from "@/app/lib/journey-utils";
import { Briefcase, HeartHandshake, Home, LogIn, Undo2 } from "lucide-react";

// The icon map
const iconMap = {
  CREATED: <LogIn className="h-5 w-5 text-muted-foreground" />,
  INTAKE_PROCESSED: <LogIn className="h-5 w-5 text-muted-foreground" />,
  STATUS_CHANGE: <Briefcase className="h-5 w-5 text-muted-foreground" />,
  OUTCOME_PROCESSED: (
    <HeartHandshake className="h-5 w-5 text-muted-foreground" />
  ),
  FOSTER_PLACED: <Home className="h-5 w-5 text-muted-foreground" />,
  FOSTER_RETURNED: <Undo2 className="h-5 w-5 text-muted-foreground" />,
};

const getIcon = (activityType: string) => {
  return (
    iconMap[activityType as keyof typeof iconMap] || (
      <Briefcase className="h-5 w-5 text-muted-foreground" />
    )
  );
};

const AnimalJourney = async ({ animalId }: { animalId: string }) => {
  const journeyData = await fetchAnimalJourney(animalId);

  const visibleJourneyItems = journeyData
    .map(formatJourneyItem)
    .filter(Boolean);

  // If no significant events are found
  if (visibleJourneyItems.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="font-semibold text-lg">No Journey Events Found</p>
        <p className="text-sm mt-1 text-muted-foreground">
          Significant events like intake, status changes, and adoption will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {journeyData.map((item, index) => {
          const formattedItem = formatJourneyItem(item);
          if (!formattedItem) {
            return null;
          }

          return (
            <li key={item.id}>
              <div className="relative pb-8">
                {index !== journeyData.length - 1 ? (
                  <span
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      {getIcon(item.activityType)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {formattedItem.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formattedItem.description}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        By: {item.changedBy.name}
                      </p>
                    </div>
                    <div className="whitespace-nowrap text-right text-xs text-muted-foreground/70">
                      <time dateTime={item.changedAt.toISOString()}>
                        {new Date(item.changedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AnimalJourney;
