// Who sees which guide. Every surface (the Help pages, search, the command
// palette, the "?" links and `related`) goes through `visibleGuides`, so a
// guide a reader can't see behaves as if it doesn't exist.
//
// No auth and no next/* imports: the caller says which permissions the reader
// holds. PR 4's assistant tools pass the actor's.
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import type { Guide } from "./guides";
import type { HelpLinkGuide } from "./help-paths";

/** The permission values (`medical:read`) a guide's keys stand for. */
export function guidePermissionValues(guide: Guide): AppPermission[] {
  return guide.permissions.map((key) => AppPermissions[key]);
}

/**
 * Every permission that shows at least one guide. A reader who holds none of
 * these sees no guides; the Help sidebar entry is gated on the same list.
 */
export function permissionsShowingGuides(guides: readonly Guide[]): AppPermission[] {
  return [...new Set(guides.flatMap(guidePermissionValues))];
}

/**
 * Of the permissions that show any guide, the ones a reader holds, asking
 * `check` about each. The caller supplies the check (the request's session,
 * or the assistant's actor), so this stays free of auth.
 */
export async function heldGuidePermissions(
  guides: readonly Guide[],
  check: (permission: AppPermission) => boolean | Promise<boolean>,
): Promise<AppPermission[]> {
  const candidates = permissionsShowingGuides(guides);
  const held = await Promise.all(candidates.map((permission) => check(permission)));
  return candidates.filter((_, i) => held[i]);
}

/** A reader sees a guide if they hold any of its permissions. */
export function canSeeGuide(
  guide: Guide,
  held: ReadonlySet<AppPermission>,
): boolean {
  return guidePermissionValues(guide).some((permission) => held.has(permission));
}

/** The guides a reader holding `held` can see, in the order given. */
export function visibleGuides(
  guides: readonly Guide[],
  held: Iterable<AppPermission>,
): Guide[] {
  const set = new Set(held);
  return guides.filter((guide) => canSeeGuide(guide, set));
}

/** Sorted by title, the order the Help page lists them in with no query. */
export function sortByTitle(guides: readonly Guide[]): Guide[] {
  return [...guides].sort((a, b) =>
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
  );
}

/** The guide with this slug, if the reader can see it. */
export function findVisibleGuide(
  visible: readonly Guide[],
  slug: string,
): Guide | undefined {
  return visible.find((guide) => guide.slug === slug);
}

/**
 * The guide a page's "?" link opens, or null when the reader can't see it,
 * so the page shows no link. Guides that fail to load also give null: a
 * help link must never take its page down, so the error is reported and the
 * page renders without its "?". `onError` may rethrow, and must for the
 * errors a framework throws on purpose (Next's `unstable_rethrow`), which
 * this module can't import.
 */
export async function helpLinkGuide(
  loadVisible: () => Promise<readonly Guide[]>,
  slug: string,
  onError: (error: unknown) => void = (error) =>
    console.error("Error loading guides for a help link:", error),
): Promise<HelpLinkGuide | null> {
  try {
    const guide = findVisibleGuide(await loadVisible(), slug);
    return guide ? { slug: guide.slug, title: guide.title } : null;
  } catch (error) {
    onError(error);
    return null;
  }
}

/**
 * A guide's `related` guides that the reader can see, in the order the guide
 * lists them. Related guides may need more permissions than the guide, so
 * each reader gets their own subset.
 */
export function visibleRelated(
  guide: Guide,
  visible: readonly Guide[],
): Guide[] {
  const bySlug = new Map(visible.map((g) => [g.slug, g]));
  return guide.related.flatMap((slug) => bySlug.get(slug) ?? []);
}
