"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useDebouncedCallback } from "use-debounce";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ChevronsUpDown, Loader2, X } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";
import Link from "next/link";
import { StaffAdoptionApplicationFormSchema } from "@/app/lib/zod-schemas/application.schemas";
import {
  INITIAL_FORM_STATE,
  StaffAdoptionApplicationFormState,
} from "@/app/lib/form-state-types";
import { PersonForApplicationFormPayload } from "@/app/lib/types";
import { AnimalSearchResult } from "@/app/lib/data/animals/animal.data";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { toYesNo } from "@/app/lib/utils/form-utils";
import { staffCreateAdoptionApplication } from "@/app/lib/actions/adoption-application.actions";

type FormValues = z.infer<typeof StaffAdoptionApplicationFormSchema>;

interface Props {
  person: PersonForApplicationFormPayload;
  animalResults: AnimalSearchResult[];
  animalSearch: string;
}

const StaffAdoptionApplicationForm = ({
  person,
  animalResults,
  animalSearch,
}: Props) => {
  const hp = person.householdProfile;
  const router = useRouter();
  const pathname = usePathname();

  const action = staffCreateAdoptionApplication.bind(null, person.id);

  const [state, formAction, isPending] = useActionState<
    StaffAdoptionApplicationFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<FormValues>({
    resolver: zodResolver(StaffAdoptionApplicationFormSchema),
    defaultValues: {
      applicantName: person.name,
      applicantEmail: person.email ?? "",
      applicantPhone: person.phone ?? "",
      applicantAddressLine1: person.address ?? "",
      applicantAddressLine2: "",
      applicantCity: person.city ?? "",
      applicantState: person.state ?? "",
      applicantZipCode: person.zipCode ?? "",
      livingSituation: hp?.livingSituation,
      householdSize: String(hp?.householdSize ?? "1"),
      hasYard: toYesNo(hp?.hasYard),
      landlordPermission: toYesNo(hp?.landlordPermission),
      hasChildren: toYesNo(hp?.hasChildren),
      childrenAges: hp?.childrenAges?.join(", ") ?? "",
      otherAnimalsDescription: hp?.otherAnimalsDescription ?? "",
      animalExperience: hp?.animalExperience ?? "",
      reasonForAdoption: "",
      animalId: "",
    },
  });

  const hasChildrenValue = form.watch("hasChildren");

  // Animal search state
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalSearchResult | null>(null);
  const [animalQuery, setAnimalQuery] = useState(animalSearch);
  const [isAnimalSearchOpen, setIsAnimalSearchOpen] = useState(false);
  const [isSearchPending, startSearchTransition] = useTransition();

  const updateSearchParam = useDebouncedCallback((query: string) => {
    startSearchTransition(() => {
      if (query.trim().length >= 2) {
        router.replace(
          `${pathname}?animalSearch=${encodeURIComponent(query.trim())}`
        );
      } else {
        router.replace(pathname);
      }
    });
  }, 300);

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof FormValues, {
          type: "server",
          message: Array.isArray(value) ? value.join(", ") : String(value),
        });
      }
    }
  }, [state, form]);

  const onSubmit = (data: FormValues) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-3xl mx-auto @container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">
              New Adoption Application
            </CardTitle>
            <CardDescription>
              Submitting on behalf of {person.name}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Section 0 — Animal */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">Animal</h3>
              <FormField
                control={form.control}
                name="animalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal to Adopt *</FormLabel>
                    {selectedAnimal ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm py-1 px-3">
                          {selectedAnimal.name} &middot; {selectedAnimal.species.name}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAnimal(null);
                            setAnimalQuery("");
                            field.onChange("");
                            router.replace(pathname);
                          }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <Popover
                        open={isAnimalSearchOpen}
                        onOpenChange={setIsAnimalSearchOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={isAnimalSearchOpen}
                            className="w-full justify-between font-normal text-muted-foreground"
                          >
                            Search for an animal...
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[--radix-popover-trigger-width] p-0"
                          align="start"
                        >
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Type an animal name..."
                              value={animalQuery}
                              onValueChange={(value) => {
                                setAnimalQuery(value);
                                updateSearchParam(value);
                              }}
                            />
                            <CommandList>
                              {isSearchPending ? (
                                <CommandEmpty>Searching...</CommandEmpty>
                              ) : animalQuery.trim().length < 2 ? (
                                <CommandEmpty>
                                  Type at least 2 characters to search.
                                </CommandEmpty>
                              ) : animalResults.length === 0 ? (
                                <CommandEmpty>No published animals found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {animalResults.map((animal) => (
                                    <CommandItem
                                      key={animal.id}
                                      value={animal.id}
                                      onSelect={() => {
                                        setSelectedAnimal(animal);
                                        field.onChange(animal.id);
                                        setIsAnimalSearchOpen(false);
                                        setAnimalQuery("");
                                        router.replace(pathname);
                                      }}
                                    >
                                      <span>{animal.name}</span>
                                      <span className="text-muted-foreground ml-2">
                                        &middot; {animal.species.name}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Section 1 — Applicant Information */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Applicant Information
              </h3>
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
                          type="email"
                          placeholder="you@example.com"
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
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {US_STATES.map((s) => (
                              <SelectItem key={s.code} value={s.code}>
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
            </div>

            {/* Section 2 — Home & Lifestyle */}
            <div className="space-y-8">
              <h3 className="font-semibold border-b pb-2">Home &amp; Lifestyle</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="livingSituation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Living Situation *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select living situation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                <FormField
                  control={form.control}
                  name="householdSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Household Size *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormDescription>
                        Including yourself, how many people live in the home?
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
                        Do they have a yard? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
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
                <FormField
                  control={form.control}
                  name="landlordPermission"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        If they rent, do they have landlord permission? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
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
                          value={field.value}
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
            </div>

            {/* Section 3 — Experience & Intent */}
            <div className="space-y-8">
              <h3 className="font-semibold border-b pb-2">
                Experience &amp; Intent
              </h3>
              <FormField
                control={form.control}
                name="animalExperience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal Experience *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe their experience with animals, including past ownership."
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
                        placeholder="Why does this person want to adopt at this time? What are they looking for in a companion?"
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button asChild variant="outline" type="button" disabled={isPending}>
              <Link
                href={`/dashboard/people-directory/${person.id}/adoption-applications`}
              >
                Cancel
              </Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default StaffAdoptionApplicationForm;
