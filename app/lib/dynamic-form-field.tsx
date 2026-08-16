import { Control, ControllerRenderProps, FieldValues, Path } from "react-hook-form";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { TemplateField } from "./types";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FieldType } from "@/prisma/generated/enums";

interface DynamicFormFieldProps {
  field: TemplateField;
  control: Control<FieldValues>;
}

type Option = string | { value: string; label: string };

export function DynamicFormField({ field, control }: DynamicFormFieldProps) {
  const renderInput = (controllerField: ControllerRenderProps<FieldValues, Path<FieldValues>>) => {
    switch (field.fieldType) {
      case FieldType.TEXT:
        return (
          <Input
            placeholder={
              field.placeholder || `Enter ${field.label.toLowerCase()}`
            }
            {...controllerField}
            value={controllerField.value || ""}
          />
        );
      case FieldType.TEXTAREA:
        return (
          <Textarea
            placeholder={
              field.placeholder || `Enter ${field.label.toLowerCase()}`
            }
            rows={3}
            {...controllerField}
            value={controllerField.value || ""}
          />
        );
      case FieldType.NUMBER:
        return (
          <Input
            type="number"
            placeholder={field.placeholder || "0"}
            {...controllerField}
            value={controllerField.value ?? ""}
            onChange={(e) => controllerField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        );
      case FieldType.SELECT: {
        const options: Option[] = field.options || [];
        return (
          <Select
            onValueChange={controllerField.onChange}
            value={controllerField.value || ""}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={field.placeholder || "Select an option"}
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => {
                const isString = typeof option === "string";
                const value = isString ? option : option.value;
                const label = isString ? option : option.label;
                return (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );
      }
      case FieldType.RADIO: {
        const options: Option[] = field.options || [];
        return (
          <RadioGroup
            onValueChange={controllerField.onChange}
            value={controllerField.value || ""}
            className="mt-2"
          >
            {options.map((option) => {
              const isString = typeof option === "string";
              const value = isString ? option : option.value;
              const label = isString ? option : option.label;
              return (
                <FormItem key={value} className="flex items-center space-x-2">
                  <FormControl>
                    <RadioGroupItem value={value} id={`${field.id}-${value}`} />
                  </FormControl>
                  <FormLabel htmlFor={`${field.id}-${value}`}>
                    {label}
                  </FormLabel>
                </FormItem>
              );
            })}
          </RadioGroup>
        );
      }
      case FieldType.CHECKBOX:
        return (
          <div className="flex items-center space-x-2 h-10">
            <FormControl>
              <Checkbox
                checked={!!controllerField.value}
                onCheckedChange={controllerField.onChange}
                id={field.id}
              />
            </FormControl>
            <FormLabel htmlFor={field.id}>
              {field.label}
            </FormLabel>
          </div>
        );
      case FieldType.DATE:
        return (
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !controllerField.value && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {controllerField.value ? (
                    format(new Date(controllerField.value), "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={
                  controllerField.value ? new Date(controllerField.value) : undefined
                }
                onSelect={controllerField.onChange}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        );
      default:
        return (
          <Input 
            type="text" 
            {...controllerField}
            value={controllerField.value || ""} 
          />
        );
    }
  };

  return (
    <FormField
      control={control}
      name={field.id}
      render={({ field: controllerField }) => (
        <FormItem>
          {field.fieldType !== FieldType.CHECKBOX && (
            <FormLabel>
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </FormLabel>
          )}
          {field.fieldType !== FieldType.CHECKBOX && field.fieldType !== FieldType.RADIO ? (
            <FormControl>{renderInput(controllerField)}</FormControl>
          ) : (
             renderInput(controllerField)
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

