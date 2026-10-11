import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry.data";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { MedicalEntryList } from "./medical-entry-list";
import { AddMedicalEntryMenu } from "./add-medical-entry-menu";

interface Props {
  /** Vaccines and tests that aren't voided, newest first. */
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  today: CalendarDay;
  controls: MedicalControls | null;
}

const VaccinesAndTests = ({ entries, names, today, controls }: Props) => {
  const vaccines = entries.filter(
    (entry) => entry.kind === MedicalEntryKind.VACCINE,
  );
  const tests = entries.filter((entry) => entry.kind === MedicalEntryKind.TEST);

  // One group per vaccine, in the order of each one's latest dose.
  const vaccineGroups = new Map<string, MedicalEntryDisplay[]>();
  for (const entry of vaccines) {
    vaccineGroups.set(entry.itemId, [
      ...(vaccineGroups.get(entry.itemId) ?? []),
      entry,
    ]);
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Vaccines & Tests</CardTitle>
        <CardDescription>
          Each vaccine with its doses, latest first, and every test with its
          results. Voided entries are only in History.
        </CardDescription>
        {controls?.canManage && (
          <CardAction>
            <AddMedicalEntryMenu
              animalId={controls.animalId}
              options={controls.options}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-labelledby="vaccines-heading" className="space-y-3">
          <h3 id="vaccines-heading" className="font-medium">
            Vaccines
          </h3>
          {vaccineGroups.size > 0 ? (
            [...vaccineGroups.values()].map((doses) => (
              <section
                key={doses[0].itemId}
                aria-label={doses[0].item.name}
                className="space-y-2"
              >
                <h4 className="text-sm font-medium text-muted-foreground">
                  {doses[0].item.name}
                </h4>
                <MedicalEntryList
                  entries={doses}
                  names={names}
                  today={today}
                  controls={controls}
                  className="space-y-2"
                />
              </section>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No vaccines recorded.</p>
          )}
        </section>

        <section aria-labelledby="tests-heading" className="space-y-3">
          <h3 id="tests-heading" className="font-medium">
            Tests
          </h3>
          {tests.length > 0 ? (
            <MedicalEntryList
              entries={tests}
              names={names}
              today={today}
              controls={controls}
              className="space-y-2"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No tests recorded.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default VaccinesAndTests;
