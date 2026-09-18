/**
 * Loading shape for BrowseSubline. Kept as a `<p>` at the same `text-[14.5px]`
 * size as the real line so its line-height (and therefore the row's height)
 * matches exactly — only the content swaps for a bar.
 */
const BrowseSublineSkeleton = () => (
  <p aria-hidden="true" className="text-[14.5px]">
    <span className="inline-block h-[17px] w-[360px] max-w-full animate-pulse rounded-full bg-organic-accent-300 align-middle" />
  </p>
);

export default BrowseSublineSkeleton;
