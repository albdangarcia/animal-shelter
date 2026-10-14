import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConditionsPage } from "@/app/lib/data/animals/medical-condition.data";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import { isOpenEpisode } from "@/app/lib/utils/problem-list";
import { ConditionList, CareEpisodeList } from "./condition-list";
import { AddConditionButtons, OpenCareEpisodeButton } from "./add-condition-buttons";
import {
  CARE_EPISODES_HEADING_ID,
  PROBLEM_LIST_HEADING_ID,
} from "./use-entry-dialog-focus";

interface Props {
  page: ConditionsPage;
  controls: MedicalControls | null;
}

/**
 * The animal's problem list and its care episodes, each with what the viewer
 * may do with them.
 */
const MedicalConditions = ({ page, controls }: Props) => {
  const { animalName, conditions, episodes, names } = page;
  const choices = controls?.canManage ? controls.conditionChoices : null;
  const hasOpenEpisode = episodes.some(isOpenEpisode);

  return (
    <div className="flex flex-col gap-4">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            {/* Takes focus when a row's menu goes, after a void. */}
            <h2 id={PROBLEM_LIST_HEADING_ID} tabIndex={-1}>
              Problem list
            </h2>
          </CardTitle>
          <CardDescription>
            Allergies, then the conditions the animal lives with, then those
            resolved. Voided rows stay here, struck through, with who voided
            them and why.
          </CardDescription>
          {/* On a row of their own: beside the description, two buttons
              squeeze it into a column on a phone. */}
          {controls && choices && (
            <div className="mt-2">
              <AddConditionButtons
                animalId={controls.animalId}
                choices={choices}
                today={controls.options.today}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {conditions.length > 0 ? (
            <ConditionList
              rows={conditions}
              names={names}
              controls={controls}
              fallbackId={PROBLEM_LIST_HEADING_ID}
            />
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No conditions or allergies on record.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            {/* Takes focus when a row's control goes, after a close or a void. */}
            <h2 id={CARE_EPISODES_HEADING_ID} tabIndex={-1}>
              Care episodes
            </h2>
          </CardTitle>
          <CardDescription>
            When the animal was under vet care or hospitalised, here or at a
            clinic. The open episode comes first.
          </CardDescription>
          {controls && choices && !hasOpenEpisode && (
            <div className="mt-2">
              <OpenCareEpisodeButton
                animalId={controls.animalId}
                vetClinics={choices.vetClinics}
                today={controls.options.today}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {episodes.length > 0 ? (
            <CareEpisodeList
              rows={episodes}
              names={names}
              controls={controls}
              fallbackId={CARE_EPISODES_HEADING_ID}
              animalName={animalName}
            />
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No care episodes on record.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicalConditions;
