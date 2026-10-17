import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TimeAgo } from "@/components/common/time-ago";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import {
  MedicalDocumentEventAction,
  MedicalDocumentType,
} from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_TYPE_LABELS } from "@/app/lib/constants/medical";
import type {
  AnimalDocuments,
  DocumentFormChoices,
  MedicalDocumentRow,
} from "@/app/lib/data/animals/medical-document.data";
import { describeDocumentChanges } from "@/app/lib/utils/medical-document-changes";
import {
  documentFileHref,
  documentFormatLabel,
  formatFileSize,
} from "@/app/lib/utils/medical-document-file";
import { formatShelterDay, formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { ChangeHistory } from "./change-history";
import {
  DOCUMENTS_HEADING_ID,
  MedicalDocumentActions,
  UploadDocumentButton,
} from "./medical-document-actions";

const typeOptions = Object.values(MedicalDocumentType).map((value) => ({
  value,
  label: MEDICAL_DOCUMENT_TYPE_LABELS[value],
}));

// What each later event reads as, before its actor.
const EVENT_VERB = {
  EDITED: "Edited",
  VOIDED: "Voided",
  FILE_REMOVED: "File removed",
} as const;

/**
 * Every change to a document since it was uploaded, behind a toggle. Who
 * uploaded it is on the row itself, so a document never changed has none.
 */
function DocumentChanges({
  document,
  names,
}: {
  document: MedicalDocumentRow;
  names: Record<string, string>;
}) {
  const later = document.events.filter(
    (event) => event.action !== MedicalDocumentEventAction.CREATED,
  );
  if (later.length === 0) return null;
  return (
    <ChangeHistory
      later={later.map((event) => {
        const after = event.after as {
          voidReason?: string;
          fileRemovalReason?: string;
        } | null;
        return {
          id: event.id,
          verb: EVENT_VERB[event.action as keyof typeof EVENT_VERB],
          actorName: event.actor.name,
          createdAt: event.createdAt,
          reason:
            event.action === MedicalDocumentEventAction.VOIDED
              ? (after?.voidReason ?? "")
              : event.action === MedicalDocumentEventAction.FILE_REMOVED
                ? (after?.fileRemovalReason ?? "")
                : null,
          changes:
            event.action === MedicalDocumentEventAction.EDITED
              ? describeDocumentChanges(event.before, event.after, names)
              : [],
        };
      })}
    />
  );
}

/**
 * One document: its name (a link that opens the file in a new tab, while the
 * file is held), type, the day on the paper, who uploaded it and when, its
 * size, the entry or foster's report it belongs to, and its notes. A voided
 * one is struck through, with who voided it and why, and who removed its
 * file, if anyone did.
 */
function MedicalDocumentItem({
  document,
  names,
  choices,
  canRemoveFile,
}: {
  document: MedicalDocumentRow;
  names: Record<string, string>;
  choices: DocumentFormChoices | null;
  canRemoveFile: boolean;
}) {
  const voided = !!document.voidedAt;
  const typeLabel = MEDICAL_DOCUMENT_TYPE_LABELS[document.type];
  const facts = [
    `Uploaded ${formatShelterDay(document.uploadedDate)} by ${document.uploadedBy.name}`,
    `${documentFormatLabel(document.contentType)}, ${formatFileSize(document.sizeBytes)}`,
  ];

  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${document.name}, ${typeLabel.toLowerCase()}${voided ? ", voided" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("min-w-0 max-w-full text-sm font-semibold break-words", voided && "line-through")}>
              {document.fileHeld ? (
                <a
                  href={documentFileHref(document.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {document.name}
                </a>
              ) : (
                document.name
              )}
            </span>
            <Badge variant="outline">{typeLabel}</Badge>
            {voided && <Badge variant="destructive">Voided</Badge>}
            {!document.fileHeld && <Badge variant="outline">File removed</Badge>}
            {document.documentDate && (
              <span className={clsx("text-sm text-muted-foreground", voided && "line-through")}>
                {formatShelterDayOrNA(document.documentDate)}
              </span>
            )}
          </div>

          <div className={clsx(voided && "line-through")}>
            <p className="mt-1 text-sm text-muted-foreground">{facts.join(" · ")}</p>
            {document.entry && document.entryLine && (
              <p className="mt-1 text-sm">
                <span className="text-xs text-muted-foreground">Belongs to: </span>
                {document.entryLine}
                {document.entry.voidedAt && " (since voided)"}
              </p>
            )}
            {document.vetReport && (
              <p className="mt-1 text-sm">
                Sent with a foster&apos;s report of the visit on{" "}
                {formatShelterDayOrNA(document.vetReport.visitDate)}
              </p>
            )}
            {document.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {document.notes}
              </p>
            )}
          </div>

          {voided && (
            <p className="mt-2 text-sm">
              Voided by {document.voidedBy?.name ?? "someone"}{" "}
              <TimeAgo date={document.voidedAt} />: {document.voidReason}
            </p>
          )}
          {document.fileRemovedAt && (
            <p className="mt-1 text-sm">
              File removed by {document.fileRemovedBy?.name ?? "someone"}{" "}
              <TimeAgo date={document.fileRemovedAt} />: {document.fileRemovalReason}
            </p>
          )}
        </div>
        <MedicalDocumentActions
          document={document}
          choices={choices}
          canRemoveFile={canRemoveFile}
        />
      </div>
      <DocumentChanges document={document} names={names} />
    </li>
  );
}

interface Props {
  animalId: string;
  page: AnimalDocuments;
  /** What the document form offers; null without MEDICAL_MANAGE. */
  choices: DocumentFormChoices | null;
  /** Whether the viewer may remove a voided document's file. */
  canRemoveFile: boolean;
}

/**
 * The animal's medical documents, newest upload first, with Upload for staff
 * who manage medical care and a filter by type.
 */
const MedicalDocuments = ({ animalId, page, choices, canRemoveFile }: Props) => {
  const { documents, types, names } = page;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          {/* Takes focus when a row's control goes, after a void or a file
              removed. */}
          <h2 id={DOCUMENTS_HEADING_ID} tabIndex={-1}>
            Documents
          </h2>
        </CardTitle>
        <CardDescription>
          Lab results, vet records, imaging, prescriptions and consent forms,
          newest upload first. Each opens in a new tab. Voided ones stay here,
          struck through, with who voided them and why.
        </CardDescription>
        {choices && (
          <CardAction>
            <UploadDocumentButton animalId={animalId} choices={choices} />
          </CardAction>
        )}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter title="Type" paramKey="type" options={typeOptions} />
        </div>
      </CardHeader>
      <CardContent>
        {documents.length > 0 ? (
          <ul className="space-y-3">
            {documents.map((document) => (
              <MedicalDocumentItem
                key={document.id}
                document={document}
                names={names}
                choices={choices}
                canRemoveFile={canRemoveFile}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            {types.length > 0 ? "No documents of these types." : "No documents on record."}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MedicalDocuments;
