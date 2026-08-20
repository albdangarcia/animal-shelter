"use client";

import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, Control } from "react-hook-form";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import {
  StaffAdoptionApplicationFormSchema,
  type StaffAdoptionApplicationFormInput,
} from "@/app/lib/zod-schemas/application.schemas";
import { PersonForApplicationFormPayload } from "@/app/lib/types";
import { AnimalSearchResult } from "@/app/lib/data/animals/animal.data";
import { toYesNo } from "@/app/lib/utils/form-utils";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { staffCreateAdoptionApplication } from "@/app/lib/actions/adoption-application.actions";
import {
  ApplicantFieldsSection,
  ApplicantFieldValues,
} from "./applicant-fields-section";

type FormValues = StaffAdoptionApplicationFormInput;

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

  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(StaffAdoptionApplicationFormSchema),
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
      householdSize: hp?.householdSize ?? 1,
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

  // Animal search state
  const [selectedAnimal, setSelectedAnimal] =
    useState<AnimalSearchResult | null>(null);
  const [animalQuery, setAnimalQuery] = useState(animalSearch);
  const [isAnimalSearchOpen, setIsAnimalSearchOpen] = useState(false);
  const [isSearchPending, startSearchTransition] = useTransition();

  const updateSearchParam = useDebouncedCallback((query: string) => {
    startSearchTransition(() => {
      if (query.trim().length >= 2) {
        router.replace(
          `${pathname}?animalSearch=${encodeURIComponent(query.trim())}`,
        );
      } else {
        router.replace(pathname);
      }
    });
  }, 300);

  // personId is an ordinary leading argument now rather than .bind()-ed onto
  // the action, and the values go over as an object.
  const onSubmit = (values: FormValues) => {
    startSubmitTransition(async () => {
      const result = await staffCreateAdoptionApplication(person.id, values);

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
            {/* Section 0 — Animal (create-only) */}
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
                        <Badge
                          variant="secondary"
                          className="text-sm py-1 px-3"
                        >
                          {selectedAnimal.name} &middot;{" "}
                          {selectedAnimal.species.name}
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
                                <CommandEmpty>
                                  No published animals found.
                                </CommandEmpty>
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

            {/* Shared applicant fields */}
            <ApplicantFieldsSection
              control={form.control as unknown as Control<ApplicantFieldValues>}
            />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
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