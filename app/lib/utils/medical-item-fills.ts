// What a medical entry form does with the fields an item fills in (its
// defaults, a test's result rows) when the item changes. Each item keeps its
// own draft of them: leaving an item keeps what it held, typed or filled in,
// so coming back to it puts that back. An item picked for the first time
// starts from what it fills in, keeping anything typed while no item was
// picked. Pure but for recording the draft, so the unit tests pin it.

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * The fields' values once the item changes from `from` ("" when none was
 * picked) to `to`. Records what `from` held in `drafts`.
 */
export const switchItem = <T extends Record<string, unknown>>(
  drafts: Map<string, T>,
  current: T,
  from: string,
  to: string,
  fills: T,
): T => {
  if (from) drafts.set(from, current);
  const draft = drafts.get(to);
  if (draft) return draft;
  if (from) return fills;
  const kept = { ...fills };
  for (const field of Object.keys(fills) as (keyof T)[]) {
    if (!isEmpty(current[field])) kept[field] = current[field];
  }
  return kept;
};
