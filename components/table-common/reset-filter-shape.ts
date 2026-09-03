/**
 * The shape of a "reset filters" control.
 *
 * A reset is a different kind of thing from the filter triggers beside it — it
 * undoes rather than narrows — and as plain text it read as an afterthought.
 * The dashed pill marks it out. `border-dashed` was free to take: the faceted
 * filter triggers used it before dropped it, so the device is no
 * longer spoken for.
 *
 * Geometry only, deliberately. Height and color are supplied by the call site,
 * so the same device can be reused by the dashboard's reset buttons at their
 * denser size and with their own tokens — the shape is shared, the values come
 * from whichever theme scope the button renders in.
 */
export const RESET_FILTER_SHAPE =
  // `has-[>svg]:px-3.5` restates the padding for the X icon's sake: shadcn's
  // Button narrows a button containing an svg via a `has()` variant, which
  // outranks a plain `px-` class on specificity and can't be merged away.
  "inline-flex items-center gap-1.5 rounded-full border border-dashed px-3.5 has-[>svg]:px-3.5 text-[13.5px] font-medium transition-colors";
