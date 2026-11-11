// Where the help pages live. Plain constants, so client components (the
// command palette, the "?" links, the search box) can import them without
// pulling in the markdown parser or the search index.

/** A guide opens at `${HELP_PATH}/<slug>`. */
export const HELP_PATH = "/dashboard/help";

export const helpGuidePath = (slug: string) => `${HELP_PATH}/${slug}`;

/**
 * What a page's "?" link needs: where it goes and its accessible name.
 * Declared here, not beside the server code that finds it, so the client
 * components that render a "?" import nothing from a server module.
 */
export type HelpLinkGuide = { slug: string; title: string };

/** The longest query the Help page searches: `searchQuerySchema`'s cap. */
export const HELP_QUERY_MAX_LENGTH = 100;

/**
 * The guide each page's "?" link opens. A unit test checks every slug names
 * a guide in docs/guides/, so renaming a guide can't quietly drop a link.
 */
export const PAGE_HELP_GUIDES = {
  medicalDue: "schedule-care-and-read-the-due-page",
  medicalDoses: "order-a-medication-and-record-doses",
  medicalBatch: "give-or-schedule-care-for-several-animals",
  animalMedical: "record-a-vaccine-test-or-treatment",
  fosterAnimal: "foster-give-care-and-report-a-vet-visit",
  settingsMedicalCatalog: "add-edit-or-retire-a-medical-catalog-item",
  settingsMedicalProtocols: "set-up-or-change-a-medical-protocol",
  settingsMedicalDoseTimes: "set-the-dose-times",
  settingsCharacteristics: "add-edit-or-delete-a-characteristic",
  settingsAnimalTaxonomy: "add-edit-or-delete-a-species-breed-or-color",
  settingsLocations: "add-edit-or-delete-a-location-or-unit",
  settingsAiActivity: "review-and-undo-the-assistants-changes",
} as const;
