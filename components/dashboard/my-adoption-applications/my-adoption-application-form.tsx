"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  createMyAdoptionApp,
  updateMyAdoptionApp,
} from "@/app/lib/actions/my-adoption-application.actions";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  AdoptionApplicationPayload,
  AnimalForAdoptionApplicationPayload,
} from "@/app/lib/types";
import {
  MyAdoptionAppFormSchema,
  type MyAdoptionAppFormInput,
} from "@/app/lib/zod-schemas/myAdoptionApplication.schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { AdoptionApplicantDefaultsPayload } from "@/app/lib/data/my-adoption-applications.data";
import { toYesNo, boolToSelectValue } from "@/app/lib/utils/form-utils";
import { NumberInput } from "@/components/forms/number-input";
import { isRenting } from "@/app/lib/zod-schemas/household-profile.schemas";

type MyApplicationFormData = MyAdoptionAppFormInput;

type FormVariant = "dashboard" | "public";

const SECTION_COUNT = 3;

/**
 * The whole of the divergence between this form's two consumers.
 *
 * `/dashboard/my-adoption-applications` keeps the shadcn Card stack it has
 * always had. `/pets/[id]/adopt` gets the hairline-separated two-column
 * sections the rest of `app/(publicpages)` uses, with a sticky step marker in
 * the left column: the same person fills this in once, nervously, and needs to
 * see how much of it is left.
 *
 * "Step 1 of 3" rather than /foster's `01` or /volunteer's inline `1.` — those
 * label items in a list, and a fraction is the one that answers "how much
 * more?". The three pages sit close enough together that reusing either device
 * would read as one template with the words swapped.
 *
 * Everything below this shell — all 17 FormFields, both conditional gates, and
 * every label, placeholder and description — is single-sourced and renders
 * identically for both. A third thing wanting to diverge is the signal to fork
 * the component, not to grow a third branch in here.
 */
function FormSection({
  variant,
  step,
  title,
  contentClassName,
  children,
}: {
  variant: FormVariant;
  step: number;
  title: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  if (variant === "public") {
    return (
      <section
        aria-labelledby={`adoption-section-${step}`}
        className={step > 1 ? "border-t border-border pt-10 sm:pt-14" : undefined}
      >
        <div className="grid gap-7 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="mb-2 font-display text-[13px] tracking-[0.06em] text-organic-accent-700">
              Step {step} of {SECTION_COUNT}
            </div>
            <h2
              id={`adoption-section-${step}`}
              className="max-w-[12ch] font-display text-[28px] sm:text-[32px]"
            >
              {title}
            </h2>
          </div>
          <div className={`min-w-0 ${contentClassName ?? ""}`.trim()}>
            {children}
          </div>
        </div>
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

interface MyApplicationFormProps {
  animal: AnimalForAdoptionApplicationPayload;
  application?: AdoptionApplicationPayload;
  applicantDefaults?: AdoptionApplicantDefaultsPayload | null;
  /**
   * Merged into every `SelectContent` this form renders. Select portals its
   * content to `<body>`, so a caller that sits inside a token scope — the
   * public pages' `.theme-organic` — has to re-open the scope here or the
   * dropdown resolves its tokens against the dashboard's theme and renders
   * black-on-cream under dark mode. The decision belongs at the call site:
   * this form is shared, and the dashboard callers must keep inheriting the
   * dashboard's theme.
   */
  selectContentClassName?: string;
  /**
   * Which shell to draw around the shared fields. Defaults to the dashboard's
   * Card stack; `"public"` is `/pets/[id]/adopt`'s hairline layout.
   *
   * Deliberately reaches no further than `FormSection` and the actions row —
   * see the note on `FormSection`.
   */
  variant?: FormVariant;
}

export function MyApplicationForm({
  animal,
  application,
  applicantDefaults,
  selectContentClassName,
  variant = "dashboard",
}: MyApplicationFormProps) {
  const isEditMode = !!application;

  const cancelHref = isEditMode
    ? "/dashboard/my-adoption-applications"
    : `/pets/${animal.id}`;

  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const household = applicantDefaults?.householdProfile;

  const form = useForm<MyApplicationFormData>({
    resolver: standardSchemaResolver(MyAdoptionAppFormSchema),
    // Contextually a DefaultValues<T>, so livingSituation is allowed to be
    // undefined here — it legitimately has no value until one is picked.
    defaultValues: {
      applicantName:
        application?.applicantName ?? applicantDefaults?.name ?? "",
      applicantEmail:
        application?.applicantEmail ?? applicantDefaults?.email ?? "",
      applicantPhone:
        application?.applicantPhone ?? applicantDefaults?.phone ?? "",
      applicantAddressLine1:
        application?.applicantAddressLine1 ?? applicantDefaults?.address ?? "",
      applicantAddressLine2: application?.applicantAddressLine2 ?? "",
      applicantCity:
        application?.applicantCity ?? applicantDefaults?.city ?? "",
      applicantState:
        application?.applicantState ?? applicantDefaults?.state ?? "",
      applicantZipCode:
        application?.applicantZipCode ?? applicantDefaults?.zipCode ?? "",
      livingSituation:
        application?.livingSituation ?? household?.livingSituation,
      hasYard: toYesNo(application?.hasYard ?? household?.hasYard),
      landlordPermission: boolToSelectValue(
        application?.landlordPermission ?? household?.landlordPermission,
      ),
      hasChildren: toYesNo(application?.hasChildren ?? household?.hasChildren),
      householdSize:
        application?.householdSize ?? household?.householdSize ?? 1,
      childrenAges:
        application?.childrenAges?.join(", ") ??
        household?.childrenAges?.join(", ") ??
        "",
      otherAnimalsDescription:
        application?.otherAnimalsDescription ??
        household?.otherAnimalsDescription ??
        "",
      animalExperience:
        application?.animalExperience ?? household?.animalExperience ?? "",
      reasonForAdoption: application?.reasonForAdoption ?? "",
    },
  });

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize safely, so it skips compiling the whole component.
  const hasChildrenValue = useWatch({
    control: form.control,
    name: "hasChildren",
  });
  const livingSituation = useWatch({
    control: form.control,
    name: "livingSituation",
  });
  const renting = isRenting(livingSituation);

  // Ids are ordinary leading arguments now instead of .bind()-ed onto the
  // action, so the create/edit choice is made at the call site.
  const handleFormSubmit = (values: MyApplicationFormData) => {
    startSubmitTransition(async () => {
      const result = isEditMode
        ? await updateMyAdoptionApp(application.id, values)
        : await createMyAdoptionApp(animal.id, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
        form.reset(values);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const isPublic = variant === "public";

  // Same sentence in both shells; only what wraps it changes.
  const intro = (
    <>
      You are applying to adopt {animal.name}, a wonderful{" "}
      {animal.breeds.length > 0
        ? `${animal.breeds.map((b) => b.name).join(" / ")} (${
            animal.species.name
          })`
        : animal.species.name}
      .
    </>
  );

  return (
    <div className={isPublic ? undefined : "space-y-8 max-w-4xl mx-auto"}>
      {/* Animal Information Header. The public page's own <h1> already reads
          "Adoption Application", so the public shell drops the title and keeps
          the sentence */}
      {isPublic ? (
        // Dropped into the same two-column grid the sections use, so it lands
        // in the field column rather than floating alone above the rail.
        <div className="mb-10 grid gap-7 sm:mb-14 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
          <p className="max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800 lg:col-start-2">
            {intro}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Adoption Application</CardTitle>
            <CardDescription>{intro}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className={isPublic ? "space-y-10 sm:space-y-14" : "space-y-8"}
        >
          {/* Section 1: Applicant Information */}
          <FormSection
            variant={variant}
            step={1}
            title="Applicant Information"
            contentClassName="space-y-6"
          >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="applicantName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicantEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicantPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="(123) 456-7890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Separator />
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="applicantAddressLine1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 1 *</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicantAddressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Apt, Suite, etc. (Optional)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="applicantCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="applicantState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className={selectContentClassName}>
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
                  <FormField
                    control={form.control}
                    name="applicantZipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code *</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
          </FormSection>

          {/* Section 2: Home & Lifestyle */}
          <FormSection
            variant={variant}
            step={2}
            title="Home & Lifestyle"
            contentClassName="space-y-8"
          >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="livingSituation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Living Situation *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your living situation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className={selectContentClassName}>
                          {livingSituationOptions.map((option) => (
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
                {/* Raw FormField rather than NumberField: this one carries a
                    FormDescription, which the wrapper has no slot for. */}
                <FormField
                  control={form.control}
                  name="householdSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Household Size *</FormLabel>
                      <FormControl>
                        <NumberInput min={1} max={50} {...field} />
                      </FormControl>
                      <FormDescription>
                        Including yourself, how many people live in your home?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasYard"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        Do you have a yard? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                          className="flex items-center space-x-4"
                        >
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="true" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="false" />
                            </FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {renting && (
                  <FormField
                    control={form.control}
                    name="landlordPermission"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <div className="text-sm font-medium">
                          Do you have landlord permission? *
                        </div>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                            className="flex items-center space-x-4"
                          >
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="true" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Yes
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="false" />
                              </FormControl>
                              <FormLabel className="font-normal">No</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="hasChildren"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        Are there children in the home? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                          className="flex items-center space-x-4"
                        >
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="true" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="false" />
                            </FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conditional rendering now checks for the string 'true' */}
                {hasChildrenValue === "true" && (
                  <FormField
                    control={form.control}
                    name="childrenAges"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Children&apos;s Ages *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 5, 12, 15" {...field} />
                        </FormControl>
                        <FormDescription>
                          Please provide a comma-separated list of ages.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <Separator />
              <FormField
                control={form.control}
                name="otherAnimalsDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Animals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe other animals in the home (species, age, temperament, etc.)."
                        className="resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </FormSection>

          {/* Section 3: Experience & Intent */}
          <FormSection
            variant={variant}
            step={3}
            title="Experience & Intent"
            contentClassName="space-y-8"
          >
              <FormField
                control={form.control}
                name="animalExperience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal Experience *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe your experience with animals, including past ownership."
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reasonForAdoption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Adoption *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Why do you want to adopt at this time? What are you looking for in a companion?"
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </FormSection>

          {/* Form Actions. The second half of the variant: the public page
              takes the pill vocabulary /foster and /volunteer close on, and
              stacks full-width below sm so both targets clear 44px. */}
          <div
            className={
              isPublic
                ? "flex flex-col-reverse gap-3 border-t border-border pt-10 sm:flex-row sm:justify-end sm:gap-4 sm:pt-14"
                : "flex justify-end space-x-4"
            }
          >
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
              className={
                isPublic
                  ? "h-auto justify-center rounded-full border-border px-[26px] py-[13px] font-display text-[15px] leading-[1.2] shadow-none hover:bg-foreground/[0.07]"
                  : undefined
              }
            >
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={
                isPublic
                  ? "h-auto justify-center rounded-full px-[26px] py-[13px] font-display text-[15px] leading-[1.2] hover:bg-organic-accent-600"
                  : undefined
              }
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Submitting..."
                : isEditMode
                  ? "Update Application"
                  : "Submit Application"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
