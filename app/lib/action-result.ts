// The single return shape for every server action that backs a form.
//
// Replaces the per-form `*FormState` interfaces in form-state-types.ts. Those
// had `success`, `message`, and `errors` as three independent optional fields,
// which meant callers had to reconstruct "what happened" from a snapshot and
// no branch was ever provably total. This is a discriminated union: narrowing
// on `ok` gives you exactly the fields that make sense in that case, and a
// missing branch is a compile error rather than a silent no-op.

/**
 * Server-side field errors, keyed by the form's INPUT field names (i.e. what
 * react-hook-form knows about), so they can be handed to form.setError as-is.
 */
export type FieldErrors<TValues> = Partial<Record<keyof TValues, string[]>>;

export type ActionSuccess<TData> = {
  ok: true;
  message: string;
  /** Optional payload — a new record's id, a redirect target, etc. */
  data?: TData;
  /** Where to navigate after success. The action must NOT call redirect(). */
  redirectTo?: string;
};

export type ActionFailure<TValues> = {
  ok: false;
  /** Always present: there is no failure without something to tell the user. */
  message: string;
  /** Absent for non-field failures (db errors, permission refusals). */
  fieldErrors?: FieldErrors<TValues>;
};

export type FormResult<TValues, TData = undefined> =
  | ActionSuccess<TData>
  | ActionFailure<TValues>;