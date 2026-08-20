export const INITIAL_FORM_STATE = { message: null, errors: {} };

// Error messages for animal form
export type AnimalFormState = {
  message?: string | null;
  errors?: {
    animalName?: string[];
    species?: string[];
    breed?: string[];
    primaryColor?: string[];
    additionalColors?: string[];
    sex?: string[];
    size?: string[];
    estimatedBirthDate?: string[];
    healthStatus?: string[];
    microchipNumber?: string[];
    intakeType?: string[];
    intakeDate?: string[];
    sourcePartnerId?: string[];
    foundAddress?: string[];
    foundCity?: string[];
    foundState?: string[];
    surrenderingPersonId?: string[];
    notes?: string[];
  };
};

export type OutcomeFormState = {
  message?: string | null;
  errors?: {
    outcomeDate?: string[];
    outcomeType?: string[];
    destinationPartnerId?: string[];
    ownerId?: string[];
    notes?: string[];
  };
};

export interface AnimalTaskFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    title?: string[];
    details?: string[];
    status?: string[];
    category?: string[];
    priority?: string[];
    dueDate?: string[];
    animalId?: string[];
    assigneeId?: string[];
  };
}

export type PersonFormState = {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
    type?: string[];
    email?: string[];
    phone?: string[];
    address?: string[];
    city?: string[];
    state?: string[];
    zipCode?: string[];
  };
  // Soft duplicate warning from _createPerson: a possible match was found by
  // email/phone, but the record was NOT created — the user must resubmit
  // with confirmDuplicate to proceed anyway.
  duplicate?: {
    id: string;
    name: string;
    matchedOn: "email" | "phone";
  } | null;
};

export type PartnerFormState = {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
    type?: string[];
    email?: string[];
    phone?: string[];
    website?: string[];
    address?: string[];
    city?: string[];
    state?: string[];
    zipCode?: string[];
    notes?: string[];
  };
};
