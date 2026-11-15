// The grid the headcount cards and their skeleton share. A module of its own,
// with no imports, so the skeleton doesn't load the cards' data and auth code.
export const HEADCOUNT_GRID_CLASS =
  "*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4";
