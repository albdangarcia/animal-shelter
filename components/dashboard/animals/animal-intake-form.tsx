"use client";

import { createAnimal, updateAnimal } from "@/app/lib/actions/animal.actions";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { parseISO } from "date-fns";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Check, ChevronsUpDown, Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  EMPTY_RECORD_FACTS,
  type ProtocolPlanFacts,
  type ProtocolPlanProtocol,
} from "@/app/lib/utils/medical-protocol-plan";
import { ProtocolPreview } from "./protocol-preview";
import {
  AnimalListingStatus,
  Sex,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  PICKABLE_SURGERY_EVIDENCE,
  SURGERY_EVIDENCE_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { normaliseChipNumber } from "@/app/lib/utils/microchip";
import { proceduresFor } from "@/app/lib/utils/spay-neuter";
import {
  animalListingStatusOptions,
  animalSexOptions,
} from "@/app/lib/utils/enum-formatter";
import {
  CreateAnimalFormSchema,
  AnimalEditFormSchema,
  type CreateAnimalFormInput,
} from "@/app/lib/zod-schemas/animal.schemas";
import { sizeOptions } from "@/components/dashboard/animals/table/animal-options";
import {
  AnimalIntakeFormPayload,
  ColorPayload,
  PartnerPayload,
  SpeciesPayload,
} from "@/app/lib/types";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import { UnitPickerLocation } from "@/app/lib/data/locations/unit-picker.data";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { formatWeight } from "@/app/lib/utils/weight-format";
import { WeightInput } from "@/components/forms/weight-input";
import { NumberField } from "@/components/forms/number-field";
import { FieldInfo } from "@/components/forms/field-info";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CareEpisodeOfferPrompt } from "@/app/lib/data/care-episode-offer.data";
import { CareEpisodeOfferDialog } from "./medical/care-episode-offer-dialog";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";

// Sentinel for the "Unplaced" option — Radix Select forbids empty-string item
// values, so we map this back to "" (currentUnitId = null) on change.
const UNPLACED_VALUE = "__unplaced__";

// Sentinel for "Not specified" — same Radix Select constraint as above, maps
// back to "" (size = null) on change.
const SIZE_NOT_SPECIFIED_VALUE = "__not_specified__";

type AnimalFormValues = CreateAnimalFormInput;

type IntakeProcedure =
  | typeof SurgeryProcedure.SPAY
  | typeof SurgeryProcedure.NEUTER;

/** Spay or neuter, as the animal's sex allows: both while it's unknown. */
const intakeProceduresFor = (sex: Sex): IntakeProcedure[] =>
  proceduresFor(sex).filter(
    (procedure): procedure is IntakeProcedure =>
      procedure === SurgeryProcedure.SPAY ||
      procedure === SurgeryProcedure.NEUTER,
  );

/** The one procedure the sex allows, picked for the user; none otherwise. */
const intakeProcedureFor = (sex: Sex): IntakeProcedure | null => {
  const procedures = intakeProceduresFor(sex);
  return procedures.length === 1 ? procedures[0] : null;
};

interface AnimalFormProps {
  speciesList: SpeciesPayload[];
  unitSystem: WeightUnitSystem;
  partners: PartnerPayload[];
  colors: ColorPayload[];
  unitOptions: UnitPickerLocation[];
  animal?: AnimalIntakeFormPayload;
  canCreatePerson?: boolean;
  /**
   * Whether the viewer may record medical care. Only then does a new intake
   * offer a microchip number and "already spayed or neutered", which go on
   * the medical record.
   */
  canManageMedical?: boolean;
  /**
   * The live medical protocols, for a viewer who may manage medical care:
   * the create form shows the one that fits the animal and what it will
   * schedule, and lets them leave it out. Anyone else's intake applies it
   * with no choice.
   */
  protocols?: ProtocolPlanProtocol[];
  /**
   * Today, on the shelter's calendar, resolved on the server. It is the day an
   * intake recorded now is filed under — a `new Date()` here would be
   * re-resolved in the viewer's zone, so the server render and the browser's
   * could disagree by a day.
   */
  today: CalendarDay;
  /** The guide the header's "?" opens, or null for no "?". */
  help?: HelpLinkGuide | null;
}

const AnimalForm = ({
  speciesList,
  unitSystem,
  partners,
  colors,
  unitOptions,
  animal,
  canCreatePerson,
  canManageMedical = false,
  protocols = [],
  today,
  help = null,
}: AnimalFormProps) => {
  const router = useRouter();
  const isEditMode = !!animal;

  const isStatusLocked =
    animal?.listingStatus === AnimalListingStatus.PENDING_ADOPTION ||
    animal?.listingStatus === AnimalListingStatus.ARCHIVED;

  // Narrower than isStatusLocked: a PENDING_ADOPTION animal is still physically
  // in the shelter and keeps an editable unit. An ARCHIVED animal has left, so
  // its placement is fixed at Unplaced (the action enforces this too).
  const isUnitLocked = animal?.listingStatus === AnimalListingStatus.ARCHIVED;

  const defaultStatusOptions = animalListingStatusOptions.filter(
    (opt) =>
      opt.value === AnimalListingStatus.DRAFT ||
      opt.value === AnimalListingStatus.PUBLISHED,
  );
  const availableStatusOptions =
    isEditMode && isStatusLocked
      ? animalListingStatusOptions.filter(
          (opt) => opt.value === animal.listingStatus,
        )
      : defaultStatusOptions;

  const [isPending, startSubmitTransition] = useTransition();
  // A changed unit into or out of a medical one asks about the animal's care
  // episode before the form leaves for the animal's page.
  const [careEpisodeOffer, setCareEpisodeOffer] = useState<{
    offer: CareEpisodeOfferPrompt;
    redirectTo: string | undefined;
  } | null>(null);
  const [currentSpeciesId, setCurrentSpeciesId] = useState(
    animal?.speciesId || "",
  );

  // Location is only a UI cascade helper (not persisted). In edit mode, derive
  // the initial location from the animal's placed unit so both selects pre-fill.
  const [currentLocationId, setCurrentLocationId] = useState(
    animal?.currentUnitId
      ? (unitOptions.find((loc) =>
          loc.units.some((u) => u.id === animal.currentUnitId),
        )?.id ?? "")
      : "",
  );

  const form = useForm<AnimalFormValues>({
    // AnimalEditFormSchema validates a strict subset of AnimalFormValues (no
    // intake fields), so its resolver's ResolverOptions type isn't assignable
    // to one built for the full CreateAnimalFormInput shape even though every
    // value it will ever receive from this form satisfies it. Both branches
    // are cast to the shape this form's single useForm<> generic commits to.
    resolver: (isEditMode
      ? standardSchemaResolver(AnimalEditFormSchema)
      : standardSchemaResolver(CreateAnimalFormSchema)) as Resolver<
      AnimalFormValues,
      unknown,
      AnimalFormValues
    >,
    defaultValues: isEditMode
      ? {
          animalName: animal.name,
          species: animal.speciesId,
          // A breed moved to another species since isn't offered for this
          // one, so it starts empty and must be picked again, rather than
          // sit unseen in the field. Deleted breeds aren't loaded at all.
          breed:
            speciesList
              .find((s) => s.id === animal.speciesId)
              ?.breeds.some((b) => b.id === animal.breeds[0]?.id)
              ? animal.breeds[0].id
              : "",
          // A deleted primary color isn't offered, so it starts empty and
          // must be picked again, rather than sit unseen in the field.
          primaryColor: colors.some((c) => c.id === animal.primaryColorId)
            ? animal.primaryColorId
            : "",
          additionalColors: animal.colors
            .filter((c) => c.id !== animal.primaryColorId)
            .map((c) => c.id),
          sex: animal.sex,
          size: animal.size ?? "",
          estimatedBirthDate: animal.birthDate,
          heightCm: animal.heightCm ?? null,
          listingStatus: animal.listingStatus,
          description: animal.description || "",
          currentUnitId: animal.currentUnitId || "",
        }
      : {
          // Today on the shelter's calendar, which is the day an intake
          // recorded now is filed under.
          intakeDate: today,
          animalName: "",
          description: "",
          intakeType: undefined,
          species: "",
          sex: Sex.UNKNOWN,
          size: "",
          breed: "",
          primaryColor: "",
          additionalColors: [],
          weightGrams: null,
          heightCm: null,
          // Left out for someone who can't record medical care, so the form
          // sends nothing the action would refuse.
          intakeMedical: canManageMedical
            ? { chipNumber: "", altered: null }
            : undefined,
          listingStatus: AnimalListingStatus.DRAFT,
          applyProtocol: true,
          currentUnitId: "",
          notes: "",
          sourcePartnerId: "",
          foundAddress: "",
          foundCity: "",
          foundState: "",
          surrenderingPersonId: "",
        },
  });

  const onSubmit = (values: AnimalFormValues) => {
    startSubmitTransition(async () => {
      const result = isEditMode
        ? await updateAnimal(animal.id, values)
        : await createAnimal(values);

      if (result.ok) {
        toast.success(result.message);
        const offer = result.data?.careEpisodeOffer;
        if (offer) {
          setCareEpisodeOffer({ offer, redirectTo: result.redirectTo });
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
        }
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const selectedSpecies = speciesList.find((s) => s.id === currentSpeciesId);

  // Prefill size from the selected breed's typicalSize — but only while the
  // field is empty and untouched. A staff member's explicit choice (including
  // deliberately clearing it back to "") must never be overwritten by a later
  // breed change. RHF's dirtyFields compares against defaultValues, so in
  // create mode (default ""), clearing the field back to "" would read as
  // NOT dirty — an explicit touched flag is needed to catch that case.
  const selectedBreedId = useWatch({ control: form.control, name: "breed" });
  const [isSizeTouched, setIsSizeTouched] = useState(false);

  useEffect(() => {
    if (isSizeTouched) return;
    if (form.getValues("size")) return;
    const breed = selectedSpecies?.breeds.find((b) => b.id === selectedBreedId);
    if (breed?.typicalSize) {
      form.setValue("size", breed.typicalSize);
    }
  }, [selectedBreedId, isSizeTouched, form, selectedSpecies]);

  const selectedLocation = unitOptions.find((l) => l.id === currentLocationId);

  // Hoisted for the additionalColors render prop below — a hook cannot be
  // called inside render, and the compiler bails on the whole file if any
  // watch() call is left in place.
  const primaryColorId = useWatch({ control: form.control, name: "primaryColor" });
  const sex = useWatch({ control: form.control, name: "sex" });
  const intakeAltered = useWatch({
    control: form.control,
    name: "intakeMedical.altered",
  });
  const speciesId = useWatch({ control: form.control, name: "species" });
  const birthDate = parseCalendarDay(
    useWatch({ control: form.control, name: "estimatedBirthDate" }),
  );
  const intakeDate = parseCalendarDay(
    useWatch({ control: form.control, name: "intakeDate" }),
  );
  const intakeChipNumber = useWatch({
    control: form.control,
    name: "intakeMedical.chipNumber",
  });

  // What the protocol's plan reads about a new animal: the form's species,
  // sex and days, and the chip and spay or neuter it records first. It has
  // no other record yet.
  const protocolFacts: ProtocolPlanFacts | null =
    speciesId && birthDate && intakeDate
      ? {
          speciesId,
          sex,
          birthDate,
          intakeDate,
          altered: !!intakeAltered,
          exempt: false,
          chipped: normaliseChipNumber(intakeChipNumber ?? "") !== "",
          openScheduled: EMPTY_RECORD_FACTS.openScheduled,
        }
      : null;

  // Advisory occupancy hint, e.g. "A-3 · 2/2" or "A-3 · 2/2 (full)". Never blocks.
  const formatUnitOption = (unit: UnitPickerLocation["units"][number]) => {
    const hint = `${unit.name} · ${unit.occupancy}/${unit.capacity}`;
    return unit.occupancy >= unit.capacity ? `${hint} (full)` : hint;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="@container space-y-8">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>
              {isEditMode ? "Edit Animal Details" : "New Animal Intake"}
            </CardTitle>
            <CardDescription>
              {isEditMode
                ? `Editing the record for ${animal.name}.`
                : "Enter all details for the incoming animal on this single form."}
            </CardDescription>
            {help && (
              <CardAction>
                <HelpLink guide={help} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-10">
            {/* Animal Information Section */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Animal Information
              </h3>
              <div className="grid grid-cols-1 @[662px]:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="animalName"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel required>Animal Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Buddy"
                          {...field}
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="species"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel required>Species</FormLabel>
                      <Select
                        name={field.name}
                        onValueChange={(value) => {
                          field.onChange(value);
                          setCurrentSpeciesId(value);
                          form.setValue("breed", "");
                        }}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a species" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {speciesList.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="breed"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel required>Breed</FormLabel>
                      <Select
                        name={field.name}
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!currentSpeciesId}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a breed" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(selectedSpecies?.breeds || []).map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="primaryColor"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel required>Primary Color</FormLabel>
                      <Select
                        name={field.name}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a color" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {colors.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="additionalColors"
                  render={({ field }) => {
                    const selectedIds: string[] = field.value || [];
                    // Options exclude the currently-selected primary color.
                    const available = colors.filter(
                      (c) => c.id !== primaryColorId,
                    );
                    const toggle = (id: string) => {
                      if (selectedIds.includes(id)) {
                        field.onChange(selectedIds.filter((x) => x !== id));
                      } else {
                        field.onChange([...selectedIds, id]);
                      }
                    };
                    return (
                      <FormItem className="col-span-2 flex flex-col">
                        <FormLabel>Additional Colors</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal"
                              >
                                {selectedIds.length > 0
                                  ? `${selectedIds.length} selected`
                                  : "Select colors"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                            <Command>
                              <CommandInput placeholder="Search colors..." />
                              <CommandList>
                                <CommandEmpty>No color found.</CommandEmpty>
                                <CommandGroup>
                                  {available.map((c) => {
                                    const checked = selectedIds.includes(c.id);
                                    return (
                                      <CommandItem
                                        key={c.id}
                                        value={c.name}
                                        onSelect={() => toggle(c.id)}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            checked
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        {c.name}
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {selectedIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {selectedIds.map((id) => {
                              const color = colors.find((c) => c.id === id);
                              if (!color) return null;
                              return (
                                <Badge
                                  key={id}
                                  variant="secondary"
                                  className="gap-1"
                                >
                                  {color.name}
                                  <button
                                    type="button"
                                    onClick={() => toggle(id)}
                                    className="rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel required>Sex</FormLabel>
                      <Select
                        name={field.name}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // A spay picked for a female doesn't suit a male.
                          const altered = form.getValues(
                            "intakeMedical.altered",
                          );
                          if (
                            altered?.procedure &&
                            !intakeProceduresFor(value as Sex).includes(
                              altered.procedure,
                            )
                          ) {
                            form.setValue(
                              "intakeMedical.altered.procedure",
                              intakeProcedureFor(value as Sex),
                            );
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select sex" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {animalSexOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DayField
                  control={form.control}
                  name="estimatedBirthDate"
                  label="Estimated Birth Date"
                  className="col-span-2"
                  triggerClassName="w-full pl-3"
                  required
                  // No future days, and nothing before the epoch the pickers
                  // share. The grid works in local dates, so the shelter's day
                  // is read as one to compare against.
                  disabledDates={(date) =>
                    date > parseISO(today) || date < parseISO("1900-01-01")
                  }
                />
                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <div className="flex items-center gap-1.5">
                        <FormLabel>Expected Adult Size</FormLabel>
                        <FieldInfo label="About expected adult size">
                          How big this animal is expected to be when fully
                          grown. Not its current size.
                        </FieldInfo>
                      </div>
                      <Select
                        name={field.name}
                        onValueChange={(value) => {
                          setIsSizeTouched(true);
                          field.onChange(
                            value === SIZE_NOT_SPECIFIED_VALUE ? "" : value,
                          );
                        }}
                        value={field.value || SIZE_NOT_SPECIFIED_VALUE}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SIZE_NOT_SPECIFIED_VALUE}>
                            Not specified
                          </SelectItem>
                          {sizeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Visually replaced by the FieldInfo popover above, but
                          kept mounted: FormDescription is what wires this text
                          into the select's aria-describedby, and popover
                          content is unmounted while closed. */}
                      <FormDescription className="sr-only">
                        How big this animal is expected to be when fully
                        grown. Not its current size.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isEditMode ? (
                  // Weight becomes read-only on edit: it's a dated observation
                  // now, not a plain field. Editing it here (with no "when was
                  // this measured" field on this form) would stamp today's
                  // date on an unknown observation — the Vitals tab is the
                  // only honest place to record a new weight.
                  <div className="col-span-2">
                    <FormLabel className="mb-2 block">Weight</FormLabel>
                    <p className="text-sm">
                      {animal.currentWeightGrams != null
                        ? formatWeight(animal.currentWeightGrams, unitSystem)
                        : "Not recorded"}
                    </p>
                    {animal.vitalsLogs[0] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        as of{" "}
                        {formatDateToLongString(animal.vitalsLogs[0].recordedAt)}
                      </p>
                    )}
                    <Link
                      href={`/dashboard/animals/${animal.id}/medical/vitals`}
                      className="text-xs text-primary underline underline-offset-2 mt-1 inline-block"
                    >
                      View vitals history
                    </Link>
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="weightGrams"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Weight</FormLabel>
                        <FormControl>
                          <WeightInput
                            unitSystem={unitSystem}
                            placeholder="e.g., 15.5"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <NumberField
                  control={form.control}
                  name="heightCm"
                  label="Height (cm)"
                  className="col-span-2"
                  decimal
                  placeholder="e.g., 55"
                />
                {/* Care the animal arrived with goes on the medical record,
                    recorded as given before intake. Later, both are recorded
                    and corrected on the Medical tab. */}
                {!isEditMode && canManageMedical && (
                  <>
                    <FormField
                      control={form.control}
                      name="intakeMedical.chipNumber"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Microchip number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., 900123000456789"
                              autoComplete="off"
                              className="font-mono"
                              {...field}
                              value={field.value ?? ""}
                              // Shown as it will be stored, without spaces
                              // or hyphens.
                              onBlur={() => {
                                field.onChange(
                                  normaliseChipNumber(field.value ?? ""),
                                );
                                field.onBlur();
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="intakeMedical.altered"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Already spayed or neutered</FormLabel>
                          <div className="flex h-9 items-center">
                            <FormControl>
                              <Switch
                                checked={!!field.value}
                                onCheckedChange={(checked) =>
                                  field.onChange(
                                    checked
                                      ? {
                                          procedure: intakeProcedureFor(sex),
                                          evidence: null,
                                        }
                                      : null,
                                  )
                                }
                              />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                    {intakeAltered && (
                      <>
                        <FormField
                          control={form.control}
                          name="intakeMedical.altered.procedure"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel required>Procedure</FormLabel>
                              <Select
                                // Its choices follow the sex. Mounted afresh
                                // when they change, so the procedure the sex
                                // change picked isn't cleared for missing
                                // from the choices it replaced.
                                key={sex}
                                name={field.name}
                                onValueChange={field.onChange}
                                value={field.value ?? ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Spay or neuter" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {intakeProceduresFor(sex).map((procedure) => (
                                    <SelectItem key={procedure} value={procedure}>
                                      {SURGERY_PROCEDURE_LABELS[procedure]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="intakeMedical.altered.evidence"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel required>Evidence</FormLabel>
                              <Select
                                name={field.name}
                                onValueChange={field.onChange}
                                value={field.value ?? ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="What shows it was done" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {PICKABLE_SURGERY_EVIDENCE.map(
                                    (evidence) => (
                                      <SelectItem key={evidence} value={evidence}>
                                        {SURGERY_EVIDENCE_LABELS[evidence]}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </>
                )}
                <FormField
                  control={form.control}
                  name="listingStatus"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <div className="flex items-center gap-1.5">
                        <FormLabel required>Listing Status</FormLabel>
                        {isStatusLocked && (
                          <FieldInfo
                            label="Why the listing status is locked"
                            tone="warning"
                            icon={TriangleAlert}
                          >
                            Status is locked. It can only be changed via the
                            application or outcome process.
                          </FieldInfo>
                        )}
                      </div>
                      <Select
                        name={field.name}
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isStatusLocked}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select listing status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Visually replaced by the FieldInfo popover above, but
                          kept mounted: FormDescription is what wires this text
                          into the select's aria-describedby, and popover
                          content is unmounted while closed. */}
                      {isStatusLocked && (
                        <FormDescription className="sr-only">
                          Status is locked. It can only be changed via the
                          application or outcome process.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Kennel placement (Location -> Unit cascade). Optional:
                    "Unplaced" leaves currentUnitId null. Location is a UI-only
                    helper; only the chosen unit is persisted. Location and
                    Unit share a row of their own, whatever fields come
                    before them. */}
                <FormItem className="col-span-3 @[662px]:col-start-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="animal-location">Location</Label>
                    <FieldInfo label="About location">
                      Where the animal is physically housed. Leave as Unplaced
                      if unknown.
                    </FieldInfo>
                  </div>
                  <Select
                    name="locationId"
                    value={currentLocationId || UNPLACED_VALUE}
                    disabled={isUnitLocked}
                    onValueChange={(value) => {
                      const locationId =
                        value === UNPLACED_VALUE ? "" : value;
                      setCurrentLocationId(locationId);
                      // Clear any previously-selected unit, mirroring the
                      // species -> breed reset.
                      form.setValue("currentUnitId", "");
                    }}
                  >
                    <SelectTrigger
                      id="animal-location"
                      className="w-full"
                      aria-describedby="location-hint"
                    >
                      <SelectValue placeholder="Select a location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNPLACED_VALUE}>Unplaced</SelectItem>
                      {unitOptions.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Not a FormField, so there's no FormDescription to wire
                      this up — the id is referenced by the trigger's
                      aria-describedby above. */}
                  <p id="location-hint" className="sr-only">
                    Where the animal is physically housed. Leave as Unplaced if
                    unknown.
                  </p>
                </FormItem>
                <FormField
                  control={form.control}
                  name="currentUnitId"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Unit</FormLabel>
                      <Select
                        name={field.name}
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={!currentLocationId || isUnitLocked}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(selectedLocation?.units || []).map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {formatUnitOption(unit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isEditMode && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    Microchips and spay/neuter status are kept on the medical
                    record, where each correction keeps its history.{" "}
                    <Link
                      href={`/dashboard/animals/${animal.id}/medical`}
                      className="text-primary underline underline-offset-2"
                    >
                      Open the Medical tab
                    </Link>
                  </p>
                )}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about this animal's personality, quirks, and what makes them special! Help potential adopters imagine them in a loving home."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Intake Section - Only show on CREATE mode */}
            {!isEditMode && (
              <IntakeFormFields
                control={form.control}
                partners={partners}
                canCreatePerson={canCreatePerson}
                today={today}
              />
            )}

            {/* Shown to someone who may manage medical care, who alone may
                leave the protocol out. */}
            {!isEditMode && canManageMedical && (
              <FormField
                control={form.control}
                name="applyProtocol"
                render={({ field }) => (
                  <ProtocolPreview
                    protocols={protocols}
                    facts={protocolFacts}
                    today={today}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            )}
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={`/dashboard/animals`}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Submitting..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Intake"}
            </Button>
          </CardFooter>
        </Card>
      </form>
      <CareEpisodeOfferDialog
        offer={careEpisodeOffer?.offer ?? null}
        onDone={() => {
          const redirectTo = careEpisodeOffer?.redirectTo;
          setCareEpisodeOffer(null);
          if (redirectTo) router.push(redirectTo);
        }}
      />
    </Form>
  );
};

export default AnimalForm;