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
  intakes: "find-an-intake",
  intakeCorrection: "correct-an-intake",
  animalCreate: "take-in-a-new-animal",
  animalReIntake: "take-back-an-animal-that-left",
  animals: "find-an-animal",
  readinessBoard: "read-the-readiness-board",
  housingBoard: "read-the-housing-board-and-drag-animals",
  reports: "read-the-reports",
  reportOutcomes: "read-the-reports",
  reportIntakes: "read-the-reports",
  reportLengthOfStay: "read-the-reports",
  animalEdit: "edit-an-animals-details",
  animalPhotos: "reorder-or-delete-an-animals-photos",
  animalPhotoUpload: "add-and-crop-an-animals-photos",
  animalVitals: "record-weight-and-vitals",
  animalCharacteristics: "set-an-animals-characteristics",
  animalAssessments: "record-a-behavior-assessment",
  animalNotes: "add-edit-or-delete-a-note",
  animalTasks: "create-assign-and-complete-tasks",
  animalJourney: "read-an-animals-activity-and-journey",
  animalActivity: "read-an-animals-activity-and-journey",
  allAnimalTasks: "create-assign-and-complete-tasks",
  outcomes: "find-an-outcome",
  outcomeCreate: "record-an-outcome",
  outcomeCorrection: "correct-an-outcome",
  applications: "find-an-adoption-application",
  animalApplications: "find-an-adoption-application",
  people: "find-a-person-and-read-their-record",
  personProfile: "find-a-person-and-read-their-record",
  personHistory: "find-a-person-and-read-their-record",
  personActivity: "find-a-person-and-read-their-record",
  personNotes: "add-edit-or-delete-a-note-on-a-person",
  personNew: "add-a-person",
  personEdit: "edit-a-persons-details-and-household",
  personHousehold: "edit-a-persons-details-and-household",
  personUnlink: "unlink-a-login-from-the-wrong-person",
  partners: "find-a-partner-and-read-its-animal-history",
  partnerHistory: "find-a-partner-and-read-its-animal-history",
  partnerContacts: "manage-a-partners-contacts",
  partnerNotes: "add-edit-or-delete-a-note-on-a-partner",
  partnerNew: "add-or-edit-a-partner",
  partnerEdit: "add-or-edit-a-partner",
  myProfile: "update-your-own-profile-and-household",
  personApplications: "find-an-adoption-application",
  applicationReview: "review-an-application-and-change-its-status",
  applicationCreate: "enter-an-adoption-application-for-someone",
  applicationEdit: "edit-an-adoption-application-for-an-applicant",
  myApplications: "check-edit-withdraw-or-reactivate-your-application",
  fosterApplications: "review-a-foster-application",
  fosters: "find-a-foster-or-a-placement",
  fosterNew: "add-a-foster-without-an-application",
  fosterProfile: "pause-deactivate-or-change-a-foster",
  fosterPlacementNew: "place-an-animal-in-foster",
  fosterReturn: "return-an-animal-from-foster",
  fosterConvert: "turn-a-foster-into-an-adoption",
  myFosterApplication: "apply-to-foster-and-withdraw",
  myFosterAnimals: "see-the-animals-in-your-care",
} as const;
