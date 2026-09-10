"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AssessmentSignal, FieldType } from "@/prisma/generated/enums";
import type {
  AssessmentTemplateDef,
  AssessmentTemplateFieldDef,
} from "@/app/lib/assessments/templates";
import {
  buildAssessmentSchema,
  type AssessmentFormValues,
} from "@/app/lib/zod-schemas/assessment.schemas";
import { isConcerningAnswer } from "@/app/lib/assessments/answers";
import { deriveSignal, formatSignal, SIGNAL_ORDER } from "@/app/lib/assessments/signal";
import type { AnimalAssessmentFormData } from "@/app/lib/data/animals/animal-assessment.data";
import {
  createAssessment,
  updateAssessment,
} from "@/app/lib/actions/animal-assessment.actions";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DateField } from "@/components/forms/date-field";
import { FieldInfo } from "@/components/forms/field-info";
import { NumberInput } from "@/components/forms/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  animalId: string;
  templates: AssessmentTemplateDef[];
  assessment?: AnimalAssessmentFormData;
}

const emptyValueFor = (field: AssessmentTemplateFieldDef) => {
  switch (field.fieldType) {
    case FieldType.NUMBER:
      return null;
    case FieldType.BOOLEAN:
      return false;
    case FieldType.MULTI_SELECT:
      return [] as string[];
    default:
      return "";
  }
};

const buildDefaults = (
  template: AssessmentTemplateDef,
  assessment?: AnimalAssessmentFormData,
): AssessmentFormValues => {
  const answerByKey = new Map(
    (assessment?.answers ?? []).map((a) => [a.templateField.key, a]),
  );

  const fields: AssessmentFormValues["fields"] = {};
  for (const field of template.fields) {
    const saved = answerByKey.get(field.key);
    let value: AssessmentFormValues["fields"][string]["value"];

    if (!saved) {
      value = emptyValueFor(field);
    } else if (field.fieldType === FieldType.NUMBER) {
      value = saved.valueNumber ?? (saved.value ? Number(saved.value) : null);
    } else if (field.fieldType === FieldType.BOOLEAN) {
      value = saved.value === "true";
    } else if (field.fieldType === FieldType.MULTI_SELECT) {
      value = saved.value ? saved.value.split(", ") : [];
    } else {
      value = saved.value ?? "";
    }

    fields[field.key] = { value, note: saved?.notes ?? "" };
  }

  return {
    templateKey: template.key,
    observedAt: assessment ? new Date(assessment.observedAt) : new Date(),
    signal: assessment?.signal ?? AssessmentSignal.NO_CONCERNS,
    summary: assessment?.summary ?? "",
    fields,
  };
};

export function AssessmentForm({ animalId, templates, assessment }: Props) {
  const isEditMode = !!assessment;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialTemplate = useMemo(() => {
    if (isEditMode) {
      return (
        templates.find((t) => t.key === assessment.template.key) ?? templates[0]
      );
    }
    return templates[0];
  }, [templates, assessment, isEditMode]);

  const [templateKey, setTemplateKey] = useState(initialTemplate?.key ?? "");
  const template = useMemo(
    () => templates.find((t) => t.key === templateKey) ?? initialTemplate,
    [templates, templateKey, initialTemplate],
  );

  const form = useForm<AssessmentFormValues>({
    resolver: template
      ? (standardSchemaResolver(
          buildAssessmentSchema(template),
        ) as Resolver<AssessmentFormValues>)
      : undefined,
    defaultValues: template
      ? buildDefaults(template, assessment)
      : undefined,
  });

  const { reset } = form;
  useEffect(() => {
    // Create mode: switching the template swaps the entire answer set.
    if (!isEditMode && template) {
      reset(buildDefaults(template));
    }
  }, [template, isEditMode, reset]);

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler can't memoize, and these values feed a memoized derivation.
  const watchedFields = useWatch({ control: form.control, name: "fields" });
  const chosenSignal = useWatch({ control: form.control, name: "signal" });

  const concerningLabels = useMemo(() => {
    if (!template) return [];
    return template.fields
      .filter((f) => isConcerningAnswer(f, watchedFields?.[f.key]?.value))
      .map((f) => f.label);
  }, [template, watchedFields]);

  const effectiveSignal = deriveSignal(
    chosenSignal ?? AssessmentSignal.NO_CONCERNS,
    concerningLabels.length,
  );

  if (!template) {
    return (
      <p className="text-sm text-muted-foreground">
        No assessment templates apply to this animal yet.
      </p>
    );
  }

  const onSubmit = (values: AssessmentFormValues) => {
    startTransition(async () => {
      const result = isEditMode
        ? await updateAssessment(assessment.id, animalId, values)
        : await createAssessment(animalId, values);

      if (result.ok) {
        toast.success(result.message);
        router.push(
          result.redirectTo ?? `/dashboard/animals/${animalId}/assessments`,
        );
        return;
      }
      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormItem>
            <div className="flex items-center gap-1.5">
              <FormLabel htmlFor="template-picker">Template</FormLabel>
              <FieldInfo label="About this template">
                {template.description}
              </FieldInfo>
            </div>
            {isEditMode ? (
              <p
                id="template-picker"
                className="text-sm font-medium py-2"
              >
                {template.name}{" "}
                <span className="text-muted-foreground">
                  (v{assessment.template.version})
                </span>
              </p>
            ) : (
              <Select
                value={templateKey}
                onValueChange={setTemplateKey}
              >
                <FormControl>
                  <SelectTrigger id="template-picker" className="w-full">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Shown in the FieldInfo popover above; kept in the DOM so
                assistive tech still reaches it (popover content unmounts
                while closed). */}
            <p className="sr-only">{template.description}</p>
          </FormItem>

          <DateField
            control={form.control}
            name="observedAt"
            label="Observed on"
            triggerClassName="w-full pl-3"
            disabledDates={(date) => date > new Date()}
          />
        </div>

        <Separator />

        <div className="space-y-5">
          {template.fields.map((field) => (
            <div
              key={field.key}
              className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2"
            >
              <AnswerField field={field} control={form.control} />
              <FormField
                control={form.control}
                name={`fields.${field.key}.note`}
                render={({ field: noteField }) => (
                  <FormItem>
                    <FormLabel htmlFor={`fields.${field.key}.note`}>
                      Note{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        id={`fields.${field.key}.note`}
                        placeholder="Anything worth adding…"
                        {...noteField}
                        value={noteField.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        {concerningLabels.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>
              Concerning {concerningLabels.length === 1 ? "finding" : "findings"}
            </AlertTitle>
            <AlertDescription>
              {concerningLabels.join(", ")}.{" "}
              {chosenSignal === AssessmentSignal.NO_CONCERNS
                ? `This will be recorded as at least "${formatSignal(
                    effectiveSignal,
                  )}".`
                : null}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="signal"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="signal">Signal</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger id="signal" className="w-full">
                      <SelectValue placeholder="Select a signal" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SIGNAL_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {formatSignal(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Summary</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="The short version a colleague should read first…"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button asChild variant="outline" type="button" disabled={isPending}>
            <Link href={`/dashboard/animals/${animalId}/assessments`}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode ? "Save changes" : "Record assessment"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

interface AnswerFieldProps {
  field: AssessmentTemplateFieldDef;
  control: ReturnType<typeof useForm<AssessmentFormValues>>["control"];
}

function AnswerField({ field, control }: AnswerFieldProps) {
  const name = `fields.${field.key}.value` as const;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: rhf }) => {
        const concerning =
          (field.concerningValues?.length ?? 0) > 0 &&
          isConcerningAnswer(field, rhf.value as string);

        return (
          <FormItem>
            <FormLabel htmlFor={name}>
              {field.label}
              {field.isRequired ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </FormLabel>
            <FormControl>
              <AnswerInput field={field} name={name} rhf={rhf} />
            </FormControl>
            {concerning && (
              <p className="text-xs font-medium text-destructive">
                Flagged as a concern.
              </p>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

interface AnswerInputProps {
  field: AssessmentTemplateFieldDef;
  name: string;
  // react-hook-form field render prop; value type varies by field.
  rhf: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    name: string;
  };
}

function AnswerInput({ field, name, rhf }: AnswerInputProps) {
  switch (field.fieldType) {
    case FieldType.NUMBER:
      return (
        <NumberInput
          id={name}
          decimal
          value={rhf.value as number | null}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );

    case FieldType.LONG_TEXT:
      return (
        <Textarea
          id={name}
          value={(rhf.value as string) ?? ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );

    case FieldType.SHORT_TEXT:
      return (
        <Input
          id={name}
          value={(rhf.value as string) ?? ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );

    case FieldType.BOOLEAN:
      return (
        <div className="flex h-9 items-center">
          <Checkbox
            id={name}
            checked={rhf.value === true}
            onCheckedChange={(checked) => rhf.onChange(checked === true)}
          />
        </div>
      );

    case FieldType.MULTI_SELECT: {
      const selected = Array.isArray(rhf.value) ? (rhf.value as string[]) : [];
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={(checked) =>
                  rhf.onChange(
                    checked === true
                      ? [...selected, option]
                      : selected.filter((v) => v !== option),
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
      );
    }

    default: {
      // SINGLE_SELECT
      const value = (rhf.value as string) ?? "";
      return (
        <Select
          value={value}
          onValueChange={rhf.onChange}
          name={rhf.name}
        >
          <SelectTrigger id={name} className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
  }
}
