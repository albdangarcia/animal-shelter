import type {
  CareEpisodeDisplay,
  MedicalConditionDisplay,
} from "@/app/lib/data/animals/medical-condition";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import { conditionTraitState, isOpenEpisode } from "@/app/lib/utils/problem-list";
import { ConditionTraitButton } from "./condition-trait-button";
import { ConditionChanges, ConditionItem } from "./condition-item";
import { ConditionActions } from "./condition-actions";
import { CareEpisodeChanges, CareEpisodeItem } from "./care-episode-item";
import { CareEpisodeActions, CloseCareEpisodeButton } from "./care-episode-actions";

interface ListProps<T> {
  rows: T[];
  /** Names for the ids the change histories hold, keyed by id. */
  names: Record<string, string>;
  /** Null for a viewer who may only read. */
  controls: MedicalControls | null;
  /** Where focus goes when a row's control is gone. */
  fallbackId?: string;
}

type RowProps<T> = Omit<ListProps<T>, "rows">;

/**
 * One problem-list row with its change history, and its menu when it isn't
 * voided and the viewer keeps the problem list.
 */
export function ConditionRow({
  condition,
  names,
  controls,
  fallbackId,
}: RowProps<MedicalConditionDisplay> & { condition: MedicalConditionDisplay }) {
  const choices = controls?.canManage ? controls.conditionChoices : null;
  const traitState = conditionTraitState(condition);
  return (
    <ConditionItem
      condition={condition}
      traitState={traitState}
      actions={
        controls && choices && !condition.voidedAt ? (
          <ConditionActions
            animalId={controls.animalId}
            condition={condition}
            choices={choices}
            today={controls.options.today}
            fallbackId={fallbackId}
          />
        ) : undefined
      }
      footer={
        <>
          {controls?.canManage &&
            controls.canManageCharacteristics &&
            condition.characteristic &&
            (traitState === "ADD" || traitState === "CITE") && (
              <ConditionTraitButton
                conditionId={condition.id}
                characteristicName={condition.characteristic.name}
                state={traitState}
                fallbackId={fallbackId}
              />
            )}
          <ConditionChanges events={condition.events} names={names} />
        </>
      }
    />
  );
}

/** Problem-list rows, each a `ConditionRow`. */
export function ConditionList({ rows, ...rest }: ListProps<MedicalConditionDisplay>) {
  return (
    <ul className="space-y-3">
      {rows.map((condition) => (
        <ConditionRow key={condition.id} condition={condition} {...rest} />
      ))}
    </ul>
  );
}

/**
 * One care episode with its change history, its menu when it isn't voided,
 * and Close when it is open, for a viewer who keeps episodes.
 */
export function CareEpisodeRow({
  episode,
  names,
  controls,
  fallbackId,
  animalName,
}: RowProps<CareEpisodeDisplay> & { episode: CareEpisodeDisplay; animalName: string }) {
  const choices = controls?.canManage ? controls.conditionChoices : null;
  return (
    <CareEpisodeItem
      episode={episode}
      actions={
        controls && choices && !episode.voidedAt ? (
          <CareEpisodeActions
            animalId={controls.animalId}
            episode={episode}
            vetClinics={choices.vetClinics}
            today={controls.options.today}
            fallbackId={fallbackId}
          />
        ) : undefined
      }
      footer={
        <>
          {controls && choices && isOpenEpisode(episode) && (
            <div className="mt-3">
              <CloseCareEpisodeButton
                episode={episode}
                animalName={animalName}
                today={controls.options.today}
                fallbackId={fallbackId}
              />
            </div>
          )}
          <CareEpisodeChanges events={episode.events} names={names} />
        </>
      }
    />
  );
}

/** Care episodes, each a `CareEpisodeRow`. */
export function CareEpisodeList({
  rows,
  ...rest
}: ListProps<CareEpisodeDisplay> & { animalName: string }) {
  return (
    <ul className="space-y-3">
      {rows.map((episode) => (
        <CareEpisodeRow key={episode.id} episode={episode} {...rest} />
      ))}
    </ul>
  );
}
