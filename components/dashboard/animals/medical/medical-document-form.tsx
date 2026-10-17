"use client";

import { useEffect, useImperativeHandle, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DayField } from "@/components/forms/day-field";
import { MedicalDocumentType } from "@/prisma/generated/enums";
import { editMedicalDocument } from "@/app/lib/actions/medical-document.actions";
import {
  MedicalDocumentCorrectionSchema,
  type MedicalDocumentCorrectionInput,
} from "@/app/lib/zod-schemas/medical-document.schemas";
import { MEDICAL_DOCUMENT_TYPE_LABELS } from "@/app/lib/constants/medical";
import type {
  DocumentFormChoices,
  MedicalDocumentRow,
} from "@/app/lib/data/animals/medical-document.data";
import {
  DOCUMENT_SNIFF_BYTES,
  MEDICAL_DOCUMENT_CONTENT_TYPES,
  documentFileIssue,
  documentNameFromFile,
  sniffDocumentType,
} from "@/app/lib/utils/medical-document-file";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import { MedicalTextareaField, OptionalSelectField } from "./medical-form-fields";

/** The form's own state: every field as the inputs hold it. */
type DocumentFormState = {
  /** The file picked; an upload's only. */
  file: File | null;
  name: string;
  type: MedicalDocumentType | null;
  documentDate: string | null;
  entryId: string | null;
  notes: string;
};

/** What the form does: upload a new document, or correct a stored one. */
export type DocumentFormMode =
  | { upload: { animalId: string } }
  | { edit: MedicalDocumentRow };

/** The form, as its dialog sees it: whether it changed, and whether a save
 * is out (the dialog doesn't close under one). */
export interface DocumentFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

interface Props {
  mode: DocumentFormMode;
  choices: DocumentFormChoices;
  onFormSubmit: () => void;
  ref?: React.Ref<DocumentFormHandle>;
}

const typeOptions = Object.values(MedicalDocumentType).map((value) => ({
  value,
  label: MEDICAL_DOCUMENT_TYPE_LABELS[value],
}));

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const startingState = (mode: DocumentFormMode): DocumentFormState => {
  if ("upload" in mode) {
    return { file: null, name: "", type: null, documentDate: null, entryId: null, notes: "" };
  }
  const stored = mode.edit;
  return {
    file: null,
    name: stored.name,
    type: stored.type,
    documentDate: stored.documentDate,
    entryId: stored.entryId,
    notes: stored.notes ?? "",
  };
};

/**
 * Why a picked file can't be a document, read as the server reads it: its
 * size, then its first bytes. Checked before anything is sent, so a wrong
 * file is refused at once; the upload route checks it again.
 */
const fileIssueOf = async (file: File | null) => {
  if (!file) return documentFileIssue({ size: 0, sniffed: null });
  const head = new Uint8Array(await file.slice(0, DOCUMENT_SNIFF_BYTES).arrayBuffer());
  return documentFileIssue({ size: file.size, sniffed: sniffDocumentType(head) });
};

/** Sends an upload to the route, reading its answer as a form's result. */
const uploadDocument = async (
  animalId: string,
  file: File,
  values: Omit<DocumentFormState, "file">,
): Promise<FormResult<DocumentFormState>> => {
  const body = new FormData();
  body.set("file", file);
  body.set("animalId", animalId);
  body.set("name", values.name);
  body.set("type", values.type ?? "");
  body.set("documentDate", values.documentDate ?? "");
  body.set("entryId", values.entryId ?? "");
  body.set("notes", values.notes);
  try {
    const response = await fetch("/api/medical-documents", { method: "POST", body });
    return (await response.json()) as FormResult<DocumentFormState>;
  } catch {
    return { ok: false, message: "The upload didn't reach the server. Try again." };
  }
};

/**
 * Uploads a medical document (its file, a name taken from the file's own,
 * its type, the day on the paper, the entry it belongs to, and notes), or
 * corrects a stored one's details. A correction never changes the file: a
 * wrong file is voided and uploaded again.
 */
export function MedicalDocumentForm({ mode, choices, onFormSubmit, ref }: Props) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const stored = "edit" in mode ? mode.edit : null;
  const animalId = "upload" in mode ? mode.upload.animalId : mode.edit.animalId;

  const form = useForm<DocumentFormState>({
    // The schema reads the state as the action takes it; the file is checked
    // on its own.
    resolver: standardSchemaResolver(
      MedicalDocumentCorrectionSchema,
    ) as unknown as Resolver<DocumentFormState>,
    defaultValues: startingState(mode),
  });

  const initialValuesRef = useRef(form.getValues());
  const fileError = form.formState.errors.file;
  useEffect(() => {
    // File inspection disables the fieldset too. Wait until its input is
    // enabled again before returning focus to the file that was refused.
    if (!isPending && fileError?.type === "client") {
      form.setFocus("file");
    }
  }, [form, isPending, fileError]);
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      isPending: () => isPending,
    }),
    [form, isPending],
  );
  // The name the last file picked gave, so picking another replaces it but
  // never a name typed by hand.
  const nameFromFileRef = useRef("");

  // A correction keeps a link to an entry voided since: the service checks
  // only an entry newly picked.
  const entryOptions = choices.entries.map((entry) => ({
    value: entry.id,
    label: capitalised(entry.label),
  }));
  if (
    stored?.entry &&
    stored.entryId &&
    stored.entryLine &&
    !entryOptions.some((option) => option.value === stored.entryId)
  ) {
    entryOptions.push({
      value: stored.entryId,
      label: `${capitalised(stored.entryLine)}${
        stored.entry.voidedAt ? " (voided)" : ""
      }`,
    });
  }

  // Neither before the animal was born nor after today.
  const outsideRange = (date: Date) => {
    const day = format(date, "yyyy-MM-dd");
    return day > choices.today || day < choices.birthDate;
  };

  const onSubmit = (parsed: DocumentFormState) => {
    startSubmitTransition(async () => {
      let result: FormResult<DocumentFormState>;
      if (stored) {
        // The form's resolver already parsed the state; the action parses it
        // again from what is sent.
        result = (await editMedicalDocument(
          stored.id,
          parsed as unknown as MedicalDocumentCorrectionInput,
        )) as FormResult<DocumentFormState>;
      } else {
        // The resolver's values leave out the file, which the schema doesn't
        // know: the upload sends the fields as the inputs hold them.
        const state = form.getValues();
        const issue = await fileIssueOf(state.file);
        if (issue || !state.file) {
          form.setError("file", { type: "client", message: issue ?? undefined });
          toast.error(issue);
          return;
        }
        result = await uploadDocument(animalId, state.file, state);
      }
      if (result.ok) {
        toast.success(result.message);
        // A route handler re-renders no page, so the upload refreshes this
        // one itself.
        if (!stored) router.refresh();
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<DocumentFormState>);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone voided it first. Refreshing shows the document as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Disabled while saving, so nothing changes under a save. A
            disabled fieldset doesn't stop a Radix select from opening, so
            each select is disabled too. */}
        <fieldset disabled={isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
          {!stored && (
            <FormField
              control={form.control}
              name="file"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="document-file" required>
                    File
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="document-file"
                      type="file"
                      accept={MEDICAL_DOCUMENT_CONTENT_TYPES.join(",")}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        field.onChange(file);
                        form.clearErrors("file");
                        const name = form.getValues("name");
                        if (file && (!name || name === nameFromFileRef.current)) {
                          nameFromFileRef.current = documentNameFromFile(file.name);
                          form.setValue("name", nameFromFileRef.current);
                          form.clearErrors("name");
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    A PDF, JPEG, PNG or WebP of up to 4 MB, kept exactly as sent.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="document-name" required>
                  Name
                </FormLabel>
                <FormControl>
                  <Input id="document-name" placeholder="Heartworm antigen panel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <OptionalSelectField
              control={form.control}
              name="type"
              label="Type"
              noneLabel="Pick a type"
              options={typeOptions}
              required
              disabled={isPending}
            />
            <DayField
              control={form.control}
              name="documentDate"
              label="Document date"
              triggerClassName="w-full"
              disabledDates={outsideRange}
              description="The day on the paper, if it has one."
            />
          </div>

          <OptionalSelectField
            control={form.control}
            name="entryId"
            label="Belongs to"
            noneLabel="No entry"
            options={entryOptions}
            disabled={isPending}
          />

          <MedicalTextareaField control={form.control} name="notes" label="Notes" />
        </fieldset>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {stored ? "Save Changes" : "Upload"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
