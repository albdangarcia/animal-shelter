import { SexOptions, SizeOptions } from "./pets-filter-options";

export interface PetFilterValues {
  query: string;
  category: string;
  color: string;
  sex: string;
  size: string;
}

/** Enum params carry their Prisma value in the URL; show the label instead. */
const labelFor = (
  options: { label: string; value: string }[],
  value: string
) => options.find((option) => option.value === value)?.label ?? value;

/**
 * The active filters as words, for the header line and the empty state.
 *
 * Both places have to say the same thing, so the phrasing lives here rather than
 * being written twice. `sort` is deliberately absent — it reorders the results
 * but never changes which animals are in them, so naming it in "no animals match
 * …" would be misleading.
 *
 * Comma-joined params ("Black,White") become one entry each, matching how the
 * query treats them.
 */
export const describePetFilters = ({
  query,
  category,
  color,
  sex,
  size,
}: PetFilterValues): string[] => {
  const split = (value: string) => value.split(",").filter(Boolean);

  return [
    ...(query ? [`“${query}”`] : []),
    ...(category ? [category] : []),
    ...split(color),
    ...split(sex).map((value) => labelFor(SexOptions, value)),
    ...split(size).map((value) => labelFor(SizeOptions, value)),
  ];
};

/** "Dog, Black and Male" — an English list, not a param dump. */
export const joinFilterLabels = (labels: string[]): string => {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};
