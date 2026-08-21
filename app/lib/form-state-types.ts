export const INITIAL_FORM_STATE = { message: null, errors: {} };

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
