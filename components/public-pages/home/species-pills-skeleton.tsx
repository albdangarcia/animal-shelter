/**
 * Loading shape for SpeciesPills. Species are data-driven, so the count and
 * labels aren't known ahead of time — this renders a plausible row of
 * varied-width pills rather than trying to predict the real ones. Sized to
 * the real pills' measured height (40px) and shares SpeciesPills' exact
 * container classes (including `pb-1` and the sm:flex-wrap/overflow-x-auto
 * split) so the row's box is identical and swapping in the real pills causes
 * no shift.
 */
const SpeciesPillsSkeleton = () => (
  <div
    aria-hidden="true"
    className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {[94, 62, 60, 63, 73, 77].map((width, index) => (
      <div
        key={index}
        style={{ width }}
        className="h-10 shrink-0 animate-pulse rounded-full bg-organic-accent-300"
      />
    ))}
  </div>
);

export default SpeciesPillsSkeleton;
