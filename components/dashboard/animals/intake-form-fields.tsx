import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { IntakeType } from "@/prisma/generated/enums";
import { intakeTypeOptions } from "@/app/lib/utils/enum-formatter";
import { US_STATES } from "@/app/lib/constants/us-states";
import { PartnerPayload } from "@/app/lib/types";
import { FieldValues, Control, Path, useWatch } from "react-hook-form";
import { IntakeFieldsValues } from "@/app/lib/zod-schemas/intake.schema";
import { PersonPicker } from "@/components/common/person-picker";

interface IntakeFormFieldsProps<T extends FieldValues & IntakeFieldsValues> {
  control: Control<T>;
  partners: PartnerPayload[];
  suggestedSurrenderingPersonId?: string;
  suggestedSurrenderingPersonLabel?: string;
  canCreatePerson?: boolean;
}

export const IntakeFormFields = <T extends FieldValues & IntakeFieldsValues>({
  control,
  partners,
  suggestedSurrenderingPersonId,
  suggestedSurrenderingPersonLabel,
  canCreatePerson,
}: IntakeFormFieldsProps<T>) => {
  // useWatch rather than a passed-in watch(): watch() subscribes the component
  // that called useForm, so the React Compiler memoizes this child and the
  // conditional blocks below never update. Taking `control` alone also drops
  // one cast per call site.
  const intakeType = useWatch({
    control,
    name: "intakeType" as Path<T>,
  }) as IntakeType | undefined;

  return (
    <div className="space-y-6">
      <h3 className="font-semibold border-b pb-2">Intake & Source Details</h3>

      <div className="grid grid-cols-1 @[662px]:grid-cols-6 gap-x-4 gap-y-8">
        <FormField
          control={control}
          name={"intakeType" as Path<T>}
          render={({ field }) => (
            <FormItem className="col-span-3">
              <FormLabel>Intake Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ""}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {intakeTypeOptions.map((option) => (
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
          control={control}
          name={"intakeDate" as Path<T>}
          render={({ field }) => (
            <FormItem className="col-span-3">
              <FormLabel>Intake Date</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground",
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
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
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={"notes" as Path<T>}
          render={({ field }) => (
            <FormItem className="col-span-full">
              <FormLabel>Internal Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any notes about the intake event..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Conditional Source Fields */}
      <div className="pt-6">
        {!intakeType && (
          <p className="text-sm text-center text-muted-foreground p-4 border border-dashed rounded-md">
            Please select an Intake Type above to enter source details.
          </p>
        )}

        {intakeType === IntakeType.TRANSFER_IN && (
          <div className="grid grid-cols-1 @[662px]:grid-cols-6 gap-x-4 gap-y-8 p-4 border rounded-md">
            <h4 className="font-semibold col-span-full">Transfer Details</h4>
            <FormField
              control={control}
              name={"sourcePartnerId" as Path<T>}
              render={({ field }) => (
                <FormItem className="col-span-full">
                  <FormLabel>Source Partner</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a partner shelter/rescue" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
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

        {intakeType === IntakeType.STRAY && (
          <div className="grid grid-cols-1 @[662px]:grid-cols-6 gap-x-4 gap-y-8 p-4 border rounded-md">
            <h4 className="font-semibold col-span-full">Location Found</h4>
            <FormField
              control={control}
              name={"foundCity" as Path<T>}
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Anytown" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={"foundState" as Path<T>}
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>State</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
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
            <FormField
              control={control}
              name={"foundAddress" as Path<T>}
              render={({ field }) => (
                <FormItem className="col-span-full">
                  <FormLabel>Address / Cross Streets</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Corner of Main St & Park Ave"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {intakeType === IntakeType.OWNER_SURRENDER && (
          <div className="grid grid-cols-1 @[662px]:grid-cols-6 gap-x-4 gap-y-8 p-4 border rounded-md">
            <h4 className="font-semibold col-span-full">
              Surrendering Person Details
            </h4>
            <FormField
              control={control}
              name={"surrenderingPersonId" as Path<T>}
              render={({ field }) => (
                <FormItem className="col-span-full">
                  <FormLabel>Surrendering Person</FormLabel>
                  <FormControl>
                    <PersonPicker
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? "")}
                      suggestedPersonId={suggestedSurrenderingPersonId}
                      suggestedPersonLabel={suggestedSurrenderingPersonLabel}
                      canCreatePerson={canCreatePerson}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};
