import { MedicalRecordHeader } from "./medical-record-header";
import { Card, CardContent } from "@/components/ui/card";
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
  // Nothing is added for an animal that has left the shelter's care; its rows
  // can still be corrected and voided.
  const canAdd = !!choices && !!controls?.options.inCare;
  const hasOpenEpisode = episodes.some(isOpenEpisode);

  return (
    <div className="flex flex-col gap-4">
      <Card className="@container/card">
        <MedicalRecordHeader
          section="conditions"
          headingId={PROBLEM_LIST_HEADING_ID}
          action={controls && choices && canAdd ? (
            <AddConditionButtons animalId={controls.animalId} choices={choices} today={controls.options.today} />
          ) : undefined}
        />
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
        <MedicalRecordHeader
          section="care-episodes"
          headingId={CARE_EPISODES_HEADING_ID}
          action={controls && choices && canAdd && !hasOpenEpisode ? (
            <OpenCareEpisodeButton animalId={controls.animalId} vetClinics={choices.vetClinics} today={controls.options.today} />
          ) : undefined}
        />
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
