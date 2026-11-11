/**
 * The species a foster's capability form offers: the live ones, then any the
 * foster lists that has since been deleted in Settings → Animal Taxonomy. The
 * form starts with the foster's own species ticked, so a deleted one must be
 * listed too, or it can't be unticked and every save would keep it.
 */
export const fosterSpeciesOptions = <T extends { id: string; name: string }>(
  liveSpecies: T[],
  fosterSpecies: { id: string; name: string }[],
): { id: string; name: string }[] => {
  const liveIds = new Set(liveSpecies.map((s) => s.id));
  return [
    ...liveSpecies.map(({ id, name }) => ({ id, name })),
    ...fosterSpecies
      .filter((s) => !liveIds.has(s.id))
      .map(({ id, name }) => ({ id, name })),
  ];
};
