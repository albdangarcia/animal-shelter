"use client";

import { useImperativeHandle, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { NumberField } from "@/components/forms/number-field";
import {
  DoseUnit,
  MedicalItemKind,
  MedicalRoute,
} from "@/prisma/generated/enums";
import type { MedicalCatalogItem } from "@/app/lib/data/medical-catalog";
import {
  createMedicalItem,
  updateMedicalItem,
} from "@/app/lib/actions/medical-catalog.actions";
import {
  HAS_DEFAULT_DOSE,
  MedicalItemFormSchema,
  type MedicalItemFormInput,
  type MedicalItemFormValues,
} from "@/app/lib/zod-schemas/medical-catalog.schemas";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ITEM_KIND_LABELS,
  MEDICAL_ROUTE_LABELS,
} from "@/app/lib/constants/medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";

const KINDS = Object.values(MedicalItemKind);
const ROUTES = Object.values(MedicalRoute);
const UNITS = Object.values(DoseUnit);

/** The form's handle: whether it is saving (its dialog doesn't close under a
 * save). */
export interface MedicalItemFormHandle {
  isPending: () => boolean;
}

interface Props {
  onFormSubmit: () => void;
  species: { id: string; name: string }[];
  item?: MedicalCatalogItem;
  ref?: React.Ref<MedicalItemFormHandle>;
}

const defaultValues = (item?: MedicalCatalogItem): MedicalItemFormInput =>
  item
    ? {
        kind: item.kind,
        name: item.name,
        manufacturer: item.manufacturer ?? "",
        speciesIds: item.species.map((species) => species.id),
        defaultRoute: item.defaultRoute,
        defaultDoseAmount: item.defaultDoseAmount,
        defaultDoseUnit: item.defaultDoseUnit,
        repeatIntervalDays: item.repeatIntervalDays,
        isRabies: item.isRabies,
        analytes: item.analytes
          .filter((analyte) => !analyte.retiredAt)
          .map((analyte) => ({ id: analyte.id, name: analyte.name })),
      }
    : {
        kind: MedicalItemKind.VACCINE,
        name: "",
        manufacturer: "",
        speciesIds: [],
        defaultRoute: null,
        defaultDoseAmount: null,
        defaultDoseUnit: null,
        repeatIntervalDays: null,
        isRabies: false,
        analytes: [],
      };

export function MedicalItemForm({ onFormSubmit, species, item, ref }: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  useImperativeHandle(ref, () => ({ isPending: () => isPending }), [isPending]);
  // An entry's kind must match its item's, and so must a protocol step's
  // (retired steps included), and an order names only a medication, so an
  // item in use keeps its kind.
  const recorded = (item?._count.entries ?? 0) > 0;
  const inProtocol = (item?._count.protocolSteps ?? 0) > 0;
  const ordered = (item?._count.medicationOrders ?? 0) > 0;
  const kindLocked = recorded || inProtocol || ordered;

  const form = useForm<MedicalItemFormInput, unknown, MedicalItemFormValues>({
    resolver: standardSchemaResolver(MedicalItemFormSchema),
    defaultValues: defaultValues(item),
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const analytes = useFieldArray({
    control: form.control,
    name: "analytes",
    // The rows carry their own `id`, so the array's React key lives elsewhere.
    keyName: "key",
  });

  // A kind's fields are hidden for the others, so their values go too: a
  // hidden value would fail validation with nowhere to show the message.
  const changeKind = (next: MedicalItemKind) => {
    form.setValue("kind", next);
    if (next !== MedicalItemKind.VACCINE) form.setValue("isRabies", false);
    if (next === MedicalItemKind.TEST) form.setValue("defaultRoute", null);
    if (!HAS_DEFAULT_DOSE.has(next)) {
      form.setValue("defaultDoseAmount", null);
      form.setValue("defaultDoseUnit", null);
    }
    if (next === MedicalItemKind.MEDICATION) {
      form.setValue("repeatIntervalDays", null);
    }
    if (next !== MedicalItemKind.TEST) {
      form.setValue("analytes", []);
    } else if (form.getValues("analytes").length === 0) {
      form.setValue("analytes", [{ id: null, name: "" }]);
    }
  };

  const onSubmit = (values: MedicalItemFormValues) => {
    startSubmitTransition(async () => {
      const result = item
        ? await updateMedicalItem(item.id, values)
        : await createMedicalItem(values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const retiredAnalytes =
    item?.analytes.filter((analyte) => analyte.retiredAt) ?? [];
  // The resolver files an error on the list itself (a name listed twice)
  // under `root` once rows exist; the server's lands on the list.
  const analytesError = form.formState.errors.analytes;
  const analytesErrorMessage =
    analytesError?.root?.message ?? analytesError?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Nothing changes while a save is out: the dialog closes when it
            succeeds, so an edit made meanwhile would be lost unsaved. A
            disabled fieldset doesn't stop a Radix select from opening, so
            each select is disabled too. */}
        <fieldset disabled={isPending} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="kind" required>
                    Kind
                  </FormLabel>
                  <Select
                    onValueChange={(value) => changeKind(value as MedicalItemKind)}
                    value={field.value}
                    name={field.name}
                    disabled={kindLocked || isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" id="kind">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {MEDICAL_ITEM_KIND_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {kindLocked && (
                    <FormDescription>
                      {recorded
                        ? "Recorded on animals"
                        : ordered
                          ? "Ordered for animals"
                          : "A step of a medical protocol"}
                      , so its kind can&apos;t change.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="name" required>
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input id="name" placeholder="e.g. DHPP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="manufacturer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="manufacturer">Manufacturer</FormLabel>
                  <FormControl>
                    <Input
                      id="manufacturer"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* A medication's order says how often. */}
            {kind !== MedicalItemKind.MEDICATION && (
              <NumberField
                control={form.control}
                name="repeatIntervalDays"
                label="Repeat every (days)"
                min={1}
                max={MAX_REPEAT_INTERVAL_DAYS}
                placeholder="e.g. 14"
              />
            )}

            {kind !== MedicalItemKind.TEST && (
              <FormField
                control={form.control}
                name="defaultRoute"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="defaultRoute">Default route</FormLabel>
                    <Select
                      disabled={isPending}
                      onValueChange={(value) =>
                        field.onChange(value === "none" ? null : value)
                      }
                      value={field.value ?? "none"}
                      name={field.name}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full" id="defaultRoute">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {ROUTES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {MEDICAL_ROUTE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {HAS_DEFAULT_DOSE.has(kind) && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  control={form.control}
                  name="defaultDoseAmount"
                  label="Default dose"
                  decimal
                  min={0}
                />
                <FormField
                  control={form.control}
                  name="defaultDoseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="defaultDoseUnit">Unit</FormLabel>
                      <Select
                        disabled={isPending}
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? null : value)
                        }
                        value={field.value ?? "none"}
                        name={field.name}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" id="defaultDoseUnit">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {UNITS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {DOSE_UNIT_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {kind === MedicalItemKind.VACCINE && (
              <FormField
                control={form.control}
                name="isRabies"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 md:col-span-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div>
                      <FormLabel>Rabies vaccine</FormLabel>
                      <FormDescription>
                        Asks for a tag number and duration, and works out the
                        day it&apos;s valid until.
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="speciesIds"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Species</FormLabel>
                  <FormDescription>
                    Leave all unticked for an item that applies to every species.
                  </FormDescription>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {species.map((option) => {
                      const checked = field.value.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              field.onChange(
                                next
                                  ? [...field.value, option.id]
                                  : field.value.filter((id) => id !== option.id),
                              )
                            }
                          />
                          {option.name}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {kind === MedicalItemKind.TEST && (
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">
                  Analytes <span className="text-destructive">*</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  What the test reports a result for, in the order staff enter
                  them. A combination test has one per result.
                </p>
                {analytes.fields.map((row, index) => (
                  <div key={row.key} className="flex items-center gap-1">
                    <FormField
                      control={form.control}
                      name={`analytes.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              aria-label={`Analyte ${index + 1}`}
                              placeholder="e.g. FeLV antigen"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move analyte ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => analytes.move(index, index - 1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move analyte ${index + 1} down`}
                      disabled={index === analytes.fields.length - 1}
                      onClick={() => analytes.move(index, index + 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove analyte ${index + 1}`}
                      onClick={() => analytes.remove(index)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                {analytesErrorMessage && (
                  <p className="text-sm text-destructive">
                    {analytesErrorMessage}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => analytes.append({ id: null, name: "" })}
                >
                  <Plus className="mr-2 size-4" />
                  Add analyte
                </Button>
                {retiredAnalytes.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Retired: {retiredAnalytes.map((a) => a.name).join(", ")}.
                    Add one back under the same name to restore it.
                  </p>
                )}
                {item && (
                  <p className="text-sm text-muted-foreground">
                    Removing an analyte retires it. Results already recorded
                    keep it.
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {item ? "Updating..." : "Creating..."}
              </>
            ) : item ? (
              "Update Item"
            ) : (
              "Create Item"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
