import { MedicalRecordHeader } from "./medical-record-header";
import { Card, CardContent } from "@/components/ui/card";
import { DOSE_SHEET_PAST_DAYS, DOSE_SLOT_LABELS } from "@/app/lib/constants/medical";
import type {
  MedicationOrderFormOptions,
  MedicationsPage,
  OrderView,
} from "@/app/lib/data/animals/medication.data";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import { formatShelterDay } from "@/app/lib/utils/shelter-day";
import { DoseDays, DoseSlotCell, doseControlsOf } from "./dose-sheet";
import { RecordAsNeededDoseButton, type DoseControls } from "./dose-slot-actions";
import { MedicationOrderActions, OrderMedicationButton } from "./medication-order-actions";
import { countsText, MedicationOrderItem } from "./medication-order-item";
import { ShowDoses } from "./show-doses";
import {
  CURRENT_MEDICATIONS_HEADING_ID,
  PAST_MEDICATIONS_HEADING_ID,
} from "./use-entry-dialog-focus";

interface Props {
  page: MedicationsPage;
  controls: MedicalControls | null;
}

function OrderRow({
  view,
  page,
  doseControls,
  orderOptions,
  animalId,
  fallbackId,
}: {
  view: OrderView;
  page: MedicationsPage;
  doseControls: DoseControls | null;
  orderOptions: MedicationOrderFormOptions | null;
  animalId: string | null;
  fallbackId: string;
}) {
  return (
    <MedicationOrderItem
      summary={view}
      names={page.names}
      actions={
        orderOptions && animalId ? (
          <MedicationOrderActions
            animalId={animalId}
            summary={view}
            options={orderOptions}
            fallbackId={fallbackId}
          />
        ) : undefined
      }
    >
      {view.state === "UPCOMING" && view.order.firstSlot && (
        <p className="mt-2 text-sm text-muted-foreground">
          First dose: {DOSE_SLOT_LABELS[view.order.firstSlot]} on{" "}
          {formatShelterDay(view.order.startDate)}.
        </p>
      )}
      {view.today.length > 0 && (
        <section aria-label={`Today's ${view.order.itemName} doses`} className="mt-3 space-y-2">
          <h3 className="text-sm font-medium">Today</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {view.today.map((slot) => (
              <DoseSlotCell key={slot.key} slot={slot} controls={doseControls} showSlotName />
            ))}
          </ul>
        </section>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <p className="text-muted-foreground">
          {view.counts
            ? `Doses so far: ${countsText(view.counts)}`
            : "Voided: its doses count for nothing."}
        </p>
        {view.asNeededDays && doseControls?.canAdminister && doseControls.inCare && (
          <RecordAsNeededDoseButton
            orderId={view.order.id}
            itemName={view.order.itemName}
            days={view.asNeededDays}
            controls={doseControls}
          />
        )}
        <ShowDoses days={view.run.length}>
          <DoseDays days={view.run} controls={doseControls} today={page.today} />
        </ShowDoses>
      </div>
    </MedicationOrderItem>
  );
}

/**
 * The animal's medication orders: those running or about to, with today's
 * doses; the dose sheet for the days before today; and the orders that have
 * ended, been discontinued or voided. Each order can show every dose of its
 * run.
 */
const MedicationOrders = ({ page, controls }: Props) => {
  const doseControls = doseControlsOf(controls, page.today, page.time);
  const orderOptions = controls?.canManage ? controls.orderOptions : null;
  const animalId = controls?.animalId ?? null;
  const row = (view: OrderView, fallbackId: string) => (
    <OrderRow
      key={view.order.id}
      view={view}
      page={page}
      doseControls={doseControls}
      orderOptions={orderOptions}
      animalId={animalId}
      fallbackId={fallbackId}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="@container/card">
        <MedicalRecordHeader
          section="current-orders"
          headingId={CURRENT_MEDICATIONS_HEADING_ID}
          action={orderOptions?.inCare && animalId ? (
            <OrderMedicationButton animalId={animalId} options={orderOptions} fallbackId={CURRENT_MEDICATIONS_HEADING_ID} />
          ) : undefined}
        />
        <CardContent>
          {page.current.length > 0 ? (
            <ul className="space-y-3">
              {page.current.map((view) => row(view, CURRENT_MEDICATIONS_HEADING_ID))}
            </ul>
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No medication is being given.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="@container/card">
        <MedicalRecordHeader section="dose-sheet" />
        <CardContent>
          {page.sheet.length > 0 ? (
            <div className="space-y-6">
              {page.sheet.map((view) => (
                <section
                  key={view.order.id}
                  aria-labelledby={`dose-sheet-${view.order.id}`}
                  className="space-y-2"
                >
                  <h3 id={`dose-sheet-${view.order.id}`} className="text-sm font-semibold">
                    {view.line}
                  </h3>
                  <DoseDays days={view.sheet} controls={doseControls} today={page.today} />
                </section>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No doses were due in the {DOSE_SHEET_PAST_DAYS} days before today.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="@container/card">
        <MedicalRecordHeader section="past-orders" headingId={PAST_MEDICATIONS_HEADING_ID} />
        <CardContent>
          {page.past.length > 0 ? (
            <ul className="space-y-3">
              {page.past.map((view) => row(view, PAST_MEDICATIONS_HEADING_ID))}
            </ul>
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No past orders.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicationOrders;
