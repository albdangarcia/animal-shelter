"use client";

import React, {
  useState,
  useEffect,
  startTransition,
  useMemo,
  useCallback,
} from "react";
import { useForm, Controller, Control, FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldType, AssessmentType } from "@/prisma/generated/enums";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActionState } from "react";
import Link from "next/link";

import {
  createAssessment,
  updateAnimalAssessment,
} from "@/app/lib/actions/animal-assessment.actions";
import {
  AnimalAssessmentFormPayload,
  AssessmentTemplateWithFields,
} from "@/app/lib/data/animals/animal-assessment.data";
import { createDynamicSchema } from "@/app/lib/zod-schemas/dynamic-form-schema";
import { DynamicFormField } from "@/app/lib/dynamic-form-field";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { TemplateField } from "@/app/lib/types";
import { assessmentOutcomeOptions } from "@/app/lib/utils/enum-formatter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
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
import { Separator } from "@/components/ui/separator";

interface AssessmentFormProps {
  animalId: string;
  templates: AssessmentTemplateWithFields[];
  assessment?: AnimalAssessmentFormPayload; // Optional: If provided, form is in "edit" mode
}

export function AssessmentForm({
  animalId,
  templates,
  assessment,
}: AssessmentFormProps) {
  const isEditMode = !!assessment;

  const action = isEditMode
    ? updateAnimalAssessment.bind(null, assessment.id, animalId)
    : createAssessment;

  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_FORM_STATE,
  );

  const [selectedTemplate, setSelectedTemplate] =
    useState<AssessmentTemplateWithFields | null>(() => {
      if (isEditMode) {
        return templates.find((t) => t.id === assessment.template?.id) || null;
      }
      return (
        templates.find((t) => t.type === AssessmentType.DAILY_MONITORING) ||
        templates[0] ||
        null
      );
    });

  const allFields = useMemo(() => {
    return selectedTemplate ? selectedTemplate.templateFields : [];
  }, [selectedTemplate]);

  const generateDefaultValues = useCallback(
    (
      fields: TemplateField[],
      currentAssessment?: AnimalAssessmentFormPayload,
    ): Record<string, unknown> => {
      const defaultVals: Record<string, unknown> = {};

      if (currentAssessment) {
        // Edit mode: Populate with existing data
        defaultVals.overallOutcome = currentAssessment.overallOutcome || "";
        defaultVals.summary = currentAssessment.summary || "";
        currentAssessment.fields.forEach((savedField) => {
          const templateField = fields.find(
            (f) => f.label === savedField.fieldName,
          );
          if (templateField) {
            let value: unknown = savedField.fieldValue;
            if (templateField.fieldType === FieldType.NUMBER) {
              value = value !== null ? Number(value) : "";
            } else if (templateField.fieldType === FieldType.CHECKBOX) {
              value = value === "true";
            }
            defaultVals[templateField.id] = value;
            defaultVals[`${templateField.id}_notes`] = savedField.notes || "";
          }
        });
      } else {
        // Create mode: Set empty defaults
        defaultVals.overallOutcome = "";
        defaultVals.summary = "";
        fields.forEach((field) => {
          defaultVals[field.id] =
            field.fieldType === FieldType.CHECKBOX ? false : "";
          defaultVals[`${field.id}_notes`] = "";
        });
      }
      return defaultVals;
    },
    [],
  );

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(createDynamicSchema(allFields)),
    defaultValues: generateDefaultValues(allFields, assessment),
  });

  const { control, reset, setError } = form;

  useEffect(() => {
    if (!isEditMode) {
      // The generateDefaultValues function is now stable
      reset(generateDefaultValues(allFields, assessment));
    }
  }, [allFields, reset, isEditMode, generateDefaultValues, assessment]);

  useEffect(() => {
    if (state.message && state.errors) {
      toast.error(state.message);
    }
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        if (value) {
          setError(key as Parameters<typeof setError>[0], {
            type: "server",
            message: value.join(", "),
          });
        }
      }
    }
  }, [state, setError]);

  const handleTemplateChange = (templateId: string) => {
    if (!isEditMode) {
      const template = templates.find((t) => t.id === templateId);
      setSelectedTemplate(template || null);
    }
  };

  const handleFormSubmit = (data: Record<string, unknown>) => {
    if (!selectedTemplate) return;

    const formData = new FormData();
    formData.append("animalId", animalId);
    formData.append("templateId", selectedTemplate.id);

    for (const key in data) {
      const value = data[key];
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  if (!selectedTemplate) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>No Templates Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please add a template to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          <FormItem className="col-span-full">
            <FormLabel htmlFor="template-switcher">
              Assessment Template
            </FormLabel>
            <Select
              value={selectedTemplate.id}
              onValueChange={handleTemplateChange}
              disabled={isEditMode}
            >
              <FormControl>
                <SelectTrigger id="template-switcher">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>

          <Separator className="col-span-full" />

          {allFields.map((field) => (
            <React.Fragment key={field.id}>
              <div className="md:col-span-2">
                <DynamicFormField
                  field={field}
                  control={form.control as Control<FieldValues>}
                />
              </div>
              <div className="md:col-span-4">
                {field.fieldType !== FieldType.CHECKBOX && (
                  <FormLabel
                    htmlFor={`${field.id}_notes`}
                    className="mb-2 block"
                  >
                    Optional Notes
                  </FormLabel>
                )}
                <Controller
                  name={`${field.id}_notes`}
                  control={control as Control<FieldValues>}
                  render={({ field: controllerField }) => (
                    <Input
                      {...controllerField}
                      id={`${field.id}_notes`}
                      placeholder="Add a note..."
                      value={controllerField.value || ""}
                    />
                  )}
                />
              </div>
            </React.Fragment>
          ))}

          <div className="md:col-span-2">
            <DynamicFormField
              field={{
                id: "overallOutcome",
                label: "Overall Outcome",
                fieldType: FieldType.SELECT,
                isRequired: false,
                options: assessmentOutcomeOptions,
                order: 999,
                placeholder: "Select an outcome",
              }}
              control={form.control as Control<FieldValues>}
            />
          </div>

          <div className="col-span-full">
            <DynamicFormField
              field={{
                id: "summary",
                label: "Summary / Key Takeaways",
                fieldType: FieldType.TEXTAREA,
                isRequired: false,
                placeholder: "Briefly summarize the assessment findings...",
                options: [],
                order: 1000,
              }}
              control={form.control as Control<FieldValues>}
            />
          </div>

          <div className="col-span-full flex justify-end space-x-2 pt-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={`/dashboard/animals/${animalId}/assessments`}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Creating..."
                : isEditMode
                  ? "Update Assessment"
                  : "Create Assessment"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
