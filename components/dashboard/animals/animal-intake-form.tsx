"use client";

import { createAnimal, updateAnimal } from "@/app/lib/actions/animal.actions";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  INITIAL_FORM_STATE,
  AnimalFormState,
} from "@/app/lib/form-state-types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Control, FieldValues, useForm, UseFormWatch } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { Calendar } from "@/components/ui/calendar";
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
import { AnimalListingStatus } from "@/prisma/generated/enums";
import {
  animalHealthStatusOptions,
  animalListingStatusOptions,
  animalSexOptions,
  intakeTypeOptions,
} from "@/app/lib/utils/enum-formatter";
import { AnimalFormSchema } from "@/app/lib/zod-schemas/animal.schemas";
import { sizeOptions } from "@/components/dashboard/animals/table/animal-options";
import { US_STATES } from "@/app/lib/constants/us-states";
import {
  AnimalIntakeFormPayload,
  ColorPayload,
  PartnerPayload,
  SpeciesPayload,
} from "@/app/lib/types";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import { IntakeFieldsValues } from "@/app/lib/zod-schemas/intake.schema";
import { UnitPickerLocation } from "@/app/lib/data/locations/unit-picker.data";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import {
  WEIGHT_UNITS,
  WeightUnit,
  toGrams,
  fromGrams,
  roundForUnit,
  formatWeight,
} from "@/app/lib/utils/weight-format";

// Sentinel for the "Unplaced" option — Radix Select forbids empty-string item
// values, so we map this back to "" (currentUnitId = null) on change.
const UNPLACED_VALUE = "__unplaced__";

// Sentinel for "Not specified" — same Radix Select constraint as above, maps
// back to "" (size = null) on change.
const SIZE_NOT_SPECIFIED_VALUE = "__not_specified__";

type AnimalFormValues = z.infer<typeof AnimalFormSchema>;

interface AnimalFormProps {
  speciesList: SpeciesPayload[];
  partners: PartnerPayload[];
  colors: ColorPayload[];
  unitOptions: UnitPickerLocation[];
  animal?: AnimalIntakeFormPayload;
}

const AnimalForm = ({
  speciesList,
  partners,
  colors,
  unitOptions,
  animal,
}: AnimalFormProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  const isEditMode = !!animal;

  const isStatusLocked =
    animal?.listingStatus === AnimalListingStatus.PENDING_ADOPTION ||
    animal?.listingStatus === AnimalListingStatus.ARCHIVED;

  const availableStatusOptions = useMemo(() => {
    if (!isEditMode) {
      return animalListingStatusOptions.filter(
        (opt) =>
          opt.value === AnimalListingStatus.DRAFT ||
          opt.value === AnimalListingStatus.PUBLISHED,
      );
    }
    if (isStatusLocked) {
      return animalListingStatusOptions.filter(
        (opt) => opt.value === animal.listingStatus,
      );
    }
    return animalListingStatusOptions.filter(
      (opt) =>
        opt.value === AnimalListingStatus.DRAFT ||
        opt.value === AnimalListingStatus.PUBLISHED,
    );
  }, [isEditMode, isStatusLocked, animal]);

  const action = isEditMode ? updateAnimal.bind(null, animal.id) : createAnimal;

  const [state, formAction, isPending] = useActionState<
    AnimalFormState,
    FormData
  >(action, INITIAL_FORM_STATE);
  const [currentSpeciesId, setCurrentSpeciesId] = useState(
    animal?.speciesId || "",
  );

  // Which of the two WEIGHT_UNITS (g/kg or oz/lb) the weight input is
  // currently expressed in. Only relevant at intake — there's no prior entry
  // to infer a starting magnitude from, so this just starts on the large unit.
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(WEIGHT_UNITS[1]);

  // Location is only a UI cascade helper (not persisted). In edit mode, derive
  // the initial location from the animal's placed unit so both selects pre-fill.
  const [currentLocationId, setCurrentLocationId] = useState(
    animal?.currentUnitId
      ? (unitOptions.find((loc) =>
          loc.units.some((u) => u.id === animal.currentUnitId),
        )?.id ?? "")
      : "",
  );

  const form = useForm({
    resolver: standardSchemaResolver(AnimalFormSchema),
    defaultValues: isEditMode
      ? {
          animalName: animal.name,
          species: animal.speciesId,
          breed: animal.breeds[0]?.id || "",
          primaryColor: animal.primaryColorId || "",
          additionalColors: animal.colors
            .filter((c) => c.id !== animal.primaryColorId)
            .map((c) => c.id),
          sex: animal.sex,
          size: animal.size ?? "",
          estimatedBirthDate: new Date(animal.birthDate),
          heightCm: animal.heightCm ?? "",
          healthStatus:
            animal.healthStatus || animalHealthStatusOptions[0].value,
          microchipNumber: animal.microchipNumber || "",
          listingStatus: animal.listingStatus,
          city: animal.city || "",
          state: animal.state || "",
          description: animal.description || "",
          currentUnitId: animal.currentUnitId || "",
        }
      : {
          intakeDate: new Date(),
          animalName: "",
          city: "",
          state: "",
          description: "",
          intakeType: intakeTypeOptions[0].value,
          species: "",
          sex: animalSexOptions[0].value,
          size: "",
          breed: "",
          primaryColor: "",
          additionalColors: [],
          weightGrams: "",
          heightCm: "",
          microchipNumber: "",
          listingStatus: AnimalListingStatus.DRAFT,
          currentUnitId: "",
          notes: "",
          healthStatus: animalHealthStatusOptions[0].value,
          sourcePartnerId: "",
          foundAddress: "",
          foundCity: "",
          foundState: "",
          surrenderingPersonId: "",
        },
  });

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }

    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof AnimalFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    }
  }, [state, form]);

  const onSubmit = (data: AnimalFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (key === "additionalColors") {
        // Append each id separately so formData.getAll() works server-side.
        (value as string[] | undefined)?.forEach((id) =>
          formData.append("additionalColors", id),
        );
      } else if (value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }
    startTransition(() => {
      formAction(formData);
    });
  };

  const selectedSpecies = speciesList.find((s) => s.id === currentSpeciesId);

  // Prefill size from the selected breed's typicalSize — but only while the
  // field is empty and untouched. A staff member's explicit choice (including
  // deliberately clearing it back to "") must never be overwritten by a later
  // breed change. RHF's dirtyFields compares against defaultValues, so in
  // create mode (default ""), clearing the field back to "" would read as
  // NOT dirty — an explicit touched flag is needed to catch that case.
  const selectedBreedId = form.watch("breed");
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

  // Advisory occupancy hint, e.g. "A-3 · 2/2" or "A-3 · 2/2 (full)". Never blocks.
  const formatUnitOption = (unit: UnitPickerLocation["units"][number]) => {
    const hint = `${unit.name} · ${unit.occupancy}/${unit.capacity}`;
    return unit.occupancy >= unit.capacity ? `${hint} (full)` : hint;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
          </CardHeader>
          <CardContent className="space-y-10">
            {/* Animal Information Section */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Animal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="animalName"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Animal Name</FormLabel>
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
                      <FormLabel>Species</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setCurrentSpeciesId(value);
                          form.setValue("breed", "");
                        }}
                        defaultValue={field.value}
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
                      <FormLabel>Breed</FormLabel>
                      <Select
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
                      <FormLabel>Primary Color</FormLabel>
                      <Select
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
                    const primaryColorId = form.watch("primaryColor");
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
                      <FormLabel>Sex</FormLabel>
                      <Select
                        onValueChange={field.onChange}
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
                <FormField
                  control={form.control}
                  name="estimatedBirthDate"
                  render={({ field }) => {
                    const dateValue = field.value as Date | undefined;

                    return (
                      <FormItem className="col-span-2">
                        <FormLabel>Estimated Birth Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !dateValue && "text-muted-foreground",
                                )}
                              >
                                {dateValue ? (
                                  format(dateValue, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateValue}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date() ||
                                date < new Date("1900-01-01")
                              }
                              autoFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Expected Adult Size</FormLabel>
                      <Select
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
                      <FormDescription>
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
                  <div className="col-span-1">
                    <FormLabel className="mb-2 block">Weight</FormLabel>
                    <p className="text-sm">
                      {animal.currentWeightGrams != null
                        ? formatWeight(animal.currentWeightGrams)
                        : "Not recorded"}
                    </p>
                    {animal.vitalsLogs[0] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        as of{" "}
                        {formatDateToLongString(animal.vitalsLogs[0].recordedAt)}
                      </p>
                    )}
                    <Link
                      href={`/dashboard/animals/${animal.id}/vitals`}
                      className="text-xs text-primary underline underline-offset-2 mt-1 inline-block"
                    >
                      View vitals history
                    </Link>
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="weightGrams"
                    render={({ field }) => {
                      const grams =
                        field.value === undefined || field.value === ""
                          ? null
                          : Number(field.value);
                      const displayValue =
                        grams == null
                          ? ""
                          : String(roundForUnit(fromGrams(grams, weightUnit), weightUnit));

                      return (
                        <FormItem className="col-span-1">
                          <FormLabel>Weight</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="e.g., 15.5"
                                value={displayValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "") {
                                    field.onChange("");
                                    return;
                                  }
                                  const parsed = parseFloat(val);
                                  if (Number.isNaN(parsed)) return;
                                  field.onChange(
                                    Math.round(toGrams(parsed, weightUnit)),
                                  );
                                }}
                              />
                            </FormControl>
                            <div className="flex rounded-md border overflow-hidden shrink-0">
                              {WEIGHT_UNITS.map((u) => (
                                <Button
                                  key={u}
                                  type="button"
                                  size="sm"
                                  variant={u === weightUnit ? "default" : "ghost"}
                                  className="rounded-none px-2"
                                  onClick={() => setWeightUnit(u)}
                                >
                                  {u}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}

                <FormField
                  control={form.control}
                  name="heightCm"
                  render={({ field }) => {
                    const value =
                      field.value === undefined || field.value === ""
                        ? ""
                        : String(field.value);

                    return (
                      <FormItem className="col-span-1">
                        <FormLabel>Height (cm)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 55"
                            {...field}
                            value={value}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? "" : parseFloat(val));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="healthStatus"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Health Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select health status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {animalHealthStatusOptions.map((option) => (
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
                <FormField
                  control={form.control}
                  name="microchipNumber"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Microchip Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 900123000456789" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="listingStatus"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Listing Status</FormLabel>
                      <Select
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
                      {isStatusLocked && (
                        <FormDescription className="text-amber-600">
                          Status is locked. It can only be changed via the
                          application or outcome process.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Anytown" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>State</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Kennel placement (Location -> Unit cascade). Optional:
                    "Unplaced" leaves currentUnitId null. Location is a UI-only
                    helper; only the chosen unit is persisted. */}
                <FormItem className="col-span-3">
                  <Label>Location</Label>
                  <Select
                    value={currentLocationId || UNPLACED_VALUE}
                    onValueChange={(value) => {
                      const locationId =
                        value === UNPLACED_VALUE ? "" : value;
                      setCurrentLocationId(locationId);
                      // Clear any previously-selected unit, mirroring the
                      // species -> breed reset.
                      form.setValue("currentUnitId", "");
                    }}
                  >
                    <SelectTrigger className="w-full">
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
                  <p className="text-muted-foreground text-sm">
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
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={!currentLocationId}
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
                control={
                  form.control as unknown as Control<
                    FieldValues & IntakeFieldsValues
                  >
                }
                watch={
                  form.watch as unknown as UseFormWatch<
                    FieldValues & IntakeFieldsValues
                  >
                }
                partners={partners}
                isEditMode={false}
                returnTo={returnTo}
                allowCreatePerson={false}
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
    </Form>
  );
};

export default AnimalForm;