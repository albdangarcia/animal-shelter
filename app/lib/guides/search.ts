// Keyword search over the guides, for the Help page, the command palette and
// the assistant's `searchGuides` tool.
//
// An in-memory MiniSearch index, built from the guides the reader can see:
// the caller filters first (see `visibleGuides`), so a guide the reader can't
// see never takes a place in the results and never counts towards a score.
// With a few dozen short guides the index takes well under a millisecond to
// build, so it is built per search rather than cached per permission set.
//
// No auth and no next/* imports: the assistant's tools reuse this.
import MiniSearch, { type SearchOptions } from "minisearch";
import type { Guide } from "./guides";

export type GuideSearchHit = Pick<Guide, "slug" | "title" | "summary">;

/** Where a search came from. It decides how loosely words match and whether a miss is logged. */
export type GuideSearchSurface = "help" | "palette" | "assistant";

export const GUIDE_SEARCH_NO_RESULTS_EVENT = "guides.search.no_results";

/**
 * How each surface searches.
 *
 * - `anyWordFallback`: when no guide has every word, match any word. On the
 *   Help page people type whole questions, so a partial match helps. The
 *   palette is mostly a record search ("jane@example.com", a phone number),
 *   where any word in a guide body matches by chance: "example" is in "for
 *   example".
 * - `logMisses`: write the no-results line when no guide has every word. A
 *   miss on the Help page is someone who wanted a guide and didn't find one. A miss in the palette is
 *   nearly always a record lookup, and its query is a person's name, email,
 *   phone number or chip number, which must not reach the log.
 *
 * The assistant searches like the Help page: its query is the model's own
 * wording of a "how do I…" question, so a partial match is worth reading, and
 * a miss is a question the guides don't answer. That wording can carry a name
 * from the person's question ("update Jane Smith's application"), so the
 * `searchGuides` tool tells the model to search with task words only. That is
 * an instruction, not a filter: a model that ignores it puts the name in the
 * log line.
 */
const SURFACE_RULES = {
  help: { anyWordFallback: true, logMisses: true },
  palette: { anyWordFallback: false, logMisses: false },
  assistant: { anyWordFallback: true, logMisses: true },
} as const satisfies Record<
  GuideSearchSurface,
  { anyWordFallback: boolean; logMisses: boolean }
>;

/**
 * Title and aliases are how staff name a task, so they weigh most; the
 * summary says what the guide does; the body mentions everything in passing.
 */
export const GUIDE_SEARCH_BOOST = {
  title: 4,
  aliases: 4,
  summary: 2,
  body: 1,
} as const;

/**
 * Words that say nothing about the task. Left in, "how do I give a shot"
 * would need every guide to contain "how", "do" and "i" before it could
 * match all its words.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "i", "if", "in", "is", "it", "me", "my", "of", "on", "or",
  "the", "this", "to", "what", "when", "where", "with", "you", "your",
]);

const processTerm = (term: string): string | null => {
  const lower = term.toLowerCase();
  return STOP_WORDS.has(lower) ? null : lower;
};

const tokenize: (text: string) => string[] = MiniSearch.getDefault("tokenize");

/**
 * The words of a query the index searches for: stop words dropped, and the
 * empty strings the tokenizer gives around leading or trailing punctuation.
 */
const searchTerms = (query: string) =>
  tokenize(query).flatMap((token) => processTerm(token) || []);

/** The body as words: a link keeps its text and drops its target. */
const bodyText = (body: string) => body.replace(/\]\([^)]*\)/g, "]");

const SEARCH_OPTIONS: SearchOptions = {
  boost: GUIDE_SEARCH_BOOST,
  // One typo in a word of 5 letters or more ("vacine", "shedule"), two in
  // one of 9 or more ("microhcip"). Shorter words must be spelled right, or
  // "care" would also find "are", and "dose" "does". A near miss counts for
  // less than the word itself.
  fuzzy: (term) => (term.length >= 9 ? 2 : term.length >= 5 ? 1 : false),
  weights: { fuzzy: 0.3, prefix: 0.375 },
  // The word being typed: "vacc" finds "vaccine".
  prefix: (term, index, terms) => index === terms.length - 1 && term.length >= 3,
  processTerm,
};

function buildIndex(guides: readonly Guide[]) {
  const index = new MiniSearch<Guide>({
    idField: "slug",
    fields: ["title", "aliases", "summary", "body"],
    extractField: (guide, field) => {
      if (field === "aliases") return guide.aliases.join(" \n ");
      if (field === "body") return bodyText(guide.body);
      return String(guide[field as keyof Guide]);
    },
    processTerm,
  });
  index.addAll(guides);
  return index;
}

export type GuideSearchOptions = {
  surface: GuideSearchSurface;
  /** The most results to return. Default: all. */
  limit?: number;
  /**
   * Where the no-results line goes, on a surface that logs misses (see
   * `SURFACE_RULES`). Default: one JSON line on stdout.
   */
  log?: (line: string) => void;
};

/**
 * Searches `guides`, which must already be the guides the reader can see,
 * best match first. Every word must match (allowing typos); on the Help page,
 * when no guide has them all, any word may.
 *
 * A Help page query that no guide has every word of is a miss, logged as one
 * structured line with the query, the surface and `fallback_hits`, and no
 * user id: it is the data for deciding whether meaning-based search is
 * needed. `fallback_hits` is how many guides the any-word fallback showed
 * instead: 0 is a plain miss, and more means the reader got guesses, which
 * for a question the guides don't answer ("reset my password") are guides
 * that only share a common word.
 *
 * A query of stop words alone ("how do I") searched for nothing, so it isn't
 * a miss.
 *
 * The Help page searches as the reader types, after a pause, so one person
 * can log "kenn", "kennel c" and "kennel cough" in a row. Whoever reads the
 * log should count such a run once: a miss followed shortly by a longer
 * query that starts with it.
 */
export function searchGuides(
  query: string,
  guides: readonly Guide[],
  { surface, limit, log = console.info }: GuideSearchOptions,
): GuideSearchHit[] {
  const trimmed = query.trim();
  if (searchTerms(trimmed).length === 0) return [];

  const rules = SURFACE_RULES[surface];
  const index = buildIndex(guides);
  let results = index.search(trimmed, { ...SEARCH_OPTIONS, combineWith: "AND" });
  if (results.length === 0) {
    if (rules.anyWordFallback) {
      results = index.search(trimmed, { ...SEARCH_OPTIONS, combineWith: "OR" });
    }
    if (rules.logMisses) {
      log(
        JSON.stringify({
          event: GUIDE_SEARCH_NO_RESULTS_EVENT,
          surface,
          query: trimmed,
          fallback_hits: results.length,
        }),
      );
    }
  }

  const bySlug = new Map(guides.map((guide) => [guide.slug, guide]));
  return results.slice(0, limit).map((result) => {
    const guide = bySlug.get(result.id as string)!;
    return { slug: guide.slug, title: guide.title, summary: guide.summary };
  });
}
