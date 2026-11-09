"use client";

import { useState } from "react";
import { useWatch, type DefaultValues, type Path, type UseFormReturn } from "react-hook-form";
import { PersonPicker } from "@/components/common/person-picker";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEATH_CIRCUMSTANCES_LABELS, EUTHANASIA_REASON_CATEGORY_LABELS, MEDICAL_REASON_MAX_LENGTH, OUTCOME_MEDICAL_TEXT_MAX_LENGTH } from "@/app/lib/constants/medical";
import type { OutcomeFormInput } from "@/app/lib/zod-schemas/outcome.schema";

export const emptyOutcomeMedical = (type: "EUTHANIZED" | "DECEASED"): DefaultValues<OutcomeFormInput>["medical"] => type === "DECEASED"
  ? { kind: "DEATH", necropsyRequested: null }
  : { kind: "EUTHANASIA", source: "IN_HOUSE", authorizedById: "", performedById: "", drug: "", dose: "", route: "" };

export function OutcomeMedicalFields({ form, clinics, people }: {
  form: UseFormReturn<OutcomeFormInput>;
  clinics: { id: string; name: string }[];
  people?: { authorizer?: { id: string; name: string }; performer?: { id: string; name: string } };
}) {
  const medical = useWatch({ control: form.control, name: "medical" });
  const [outsidePerformer, setOutsidePerformer] = useState(medical?.kind === "EUTHANASIA" && !!medical.performedByName);
  const text = (name: Path<OutcomeFormInput>, label: string, required = false, long = false) => (
    <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem className="min-w-0">
      <FormLabel required={required}>{label}</FormLabel><FormControl>
        {long ? <Textarea name={field.name} ref={field.ref} onBlur={field.onBlur} value={String(field.value ?? "")} onChange={field.onChange} maxLength={MEDICAL_REASON_MAX_LENGTH} />
          : <Input name={field.name} ref={field.ref} onBlur={field.onBlur} value={String(field.value ?? "")} onChange={field.onChange} maxLength={OUTCOME_MEDICAL_TEXT_MAX_LENGTH} />}
      </FormControl><FormMessage /></FormItem>} />
  );
  const select = (name: Path<OutcomeFormInput>, label: string, choices: Record<string, string>, required = true) => (
    <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem>
      <FormLabel required={required}>{label}</FormLabel><FormControl><select className="border rounded-md h-9 w-full min-w-0 px-3 bg-background" name={field.name} ref={field.ref} onBlur={field.onBlur} value={String(field.value ?? "")} onChange={field.onChange}>
        {!("" in choices) && <option value="">Select…</option>}
        {Object.entries(choices).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select></FormControl><FormMessage /></FormItem>} />
  );
  const person = (name: "medical.authorizedById" | "medical.performedById", label: string, initialSelection?: { id: string; name: string }) => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem>
    <FormLabel required>{label}</FormLabel><FormControl><PersonPicker value={field.value || null} onChange={(id) => field.onChange(id ?? "")} initialSelection={initialSelection} /></FormControl><FormMessage />
  </FormItem>} />;
  return <section aria-label="Medical details" className="space-y-4 min-w-0">
    <h3 className="font-semibold">Medical details</h3>
    <p className="text-sm text-muted-foreground">These facts are recorded in Medical History. Correct them here; reversing the outcome voids the linked medical entry.</p>
    {medical?.kind === "EUTHANASIA" ? <>
      <FormField control={form.control} name="medical.source" render={({ field }) => <FormItem><FormLabel required>Source</FormLabel><FormControl>
        <select className="border rounded-md h-9 w-full px-3 bg-background" value={field.value ?? "IN_HOUSE"} onChange={(event) => {
          field.onChange(event.target.value);
          if (event.target.value === "IN_HOUSE") {
            form.setValue("medical.vetPartnerId", null); form.setValue("medical.vetName", null);
            form.setValue("medical.performedByName", null); setOutsidePerformer(false);
          }
        }}><option value="IN_HOUSE">In house</option><option value="OUTSIDE_VET">Outside vet</option></select>
      </FormControl><FormMessage /></FormItem>} />
      {select("medical.reasonCategory", "Reason category", EUTHANASIA_REASON_CATEGORY_LABELS)}
      {text("medical.reasonNotes", "Reason notes", medical.reasonCategory === "OTHER", true)}
      {person("medical.authorizedById", "Authorized by", people?.authorizer)}
      <p className="text-sm text-muted-foreground">Records who authorized the procedure; selecting a person does not request approval.</p>
      {medical.source === "OUTSIDE_VET" && <>
        {select("medical.vetPartnerId", "Vet clinic", { "": "No clinic recorded", ...Object.fromEntries(clinics.map((clinic) => [clinic.id, clinic.name])) }, false)}
        {text("medical.vetName", "Vet name")}
        <label className="block text-sm">Performer type<select className="mt-2 border rounded-md h-9 w-full px-3 bg-background" value={outsidePerformer ? "NAME" : "PERSON"} onChange={(event) => {
          setOutsidePerformer(event.target.value === "NAME");
          form.setValue("medical.performedById", null); form.setValue("medical.performedByName", null);
        }}><option value="PERSON">Person in directory</option><option value="NAME">Outside vet name</option></select></label>
      </>}
      {outsidePerformer ? text("medical.performedByName", "Performed by outside vet", true) : person("medical.performedById", "Performed by", people?.performer)}
      {text("medical.drug", "Drug", true)}{text("medical.dose", "Dose including unit", true)}{text("medical.route", "Route", true)}
      {text("medical.witness", "Witness")}{text("medical.bodyDisposition", "Body disposition")}
    </> : medical?.kind === "DEATH" ? <>
      {select("medical.circumstances", "Circumstances", DEATH_CIRCUMSTANCES_LABELS)}
      {text("medical.circumstanceNotes", "Circumstance notes", medical.circumstances === "OTHER", true)}
      {select("medical.causeKnowledge", "Cause knowledge", { UNKNOWN: "Unknown", KNOWN: "Known" })}
      {medical.causeKnowledge === "KNOWN" && text("medical.cause", "Cause", true, true)}
      <FormField control={form.control} name="medical.necropsyRequested" render={({ field }) => <FormItem><FormLabel required>Necropsy requested</FormLabel><FormControl>
        <select className="border rounded-md h-9 w-full px-3 bg-background" value={field.value === null ? "UNKNOWN" : field.value ? "YES" : "NO"} onChange={(event) => field.onChange(event.target.value === "UNKNOWN" ? null : event.target.value === "YES")}>
          <option value="UNKNOWN">Unknown</option><option value="YES">Yes</option><option value="NO">No</option>
        </select></FormControl><FormMessage /></FormItem>} />
      {text("medical.bodyDisposition", "Body disposition")}
    </> : null}
  </section>;
}
