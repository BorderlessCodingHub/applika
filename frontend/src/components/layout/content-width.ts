/**
 * Which routes get the whole shell width, and which sit in the reading column.
 *
 * `AppShell` renders the content container itself, so no page component renders
 * one — including the pages that do NOT want it. The opt-out therefore lives
 * here, beside the shell, matched on the same `activePath` the nav is matched
 * on, rather than as a prop every page would have to thread through its layout.
 *
 * Kept OUT of `nav.ts` on purpose: these are not nav entries, and `PRIMARY_NAV`
 * is pinned at seven by `e2e/shell-responsive.spec.ts`.
 */

/**
 * The CV editing routes (KODI-008). The owner: "also, use the full page width
 * for this page" — the editor and its A4 preview share the width, and the
 * `max-w-7xl` column left dead space to the right of both.
 */
export const FULL_WIDTH_PATHS = [
  "/cvs/new",
  "/cvs/editor",
  "/applications/cv",
] as const;

/**
 * `true` when `path` is one of {@link FULL_WIDTH_PATHS}.
 *
 * Exact match, with a trailing slash tolerated: the static export serves both
 * `/cvs/new` and `/cvs/new/`, which is the same reason `isNavItemActive`
 * carries its own slash handling.
 */
export function isFullWidthPath(path: string): boolean {
  const normalised = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return FULL_WIDTH_PATHS.some((entry) => entry === normalised);
}
