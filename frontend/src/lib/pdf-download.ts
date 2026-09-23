/**
 * Saving a server-rendered PDF to disk.
 *
 * The PDF is typeset on the SERVER (ADR 0011: RenderCV/Typst, theme `applika`).
 * Nothing here draws, rasterises or lays out anything — the browser's only job
 * is to take the bytes the API already produced and hand them to the download
 * manager under the right name.
 *
 * The filename is the server's to choose: it ships it in `Content-Disposition`
 * and CORS exposes that header. `cvPdfFilename` exists for the one case where
 * the header did not survive the trip (a proxy stripped it, or it is malformed)
 * and mirrors the server's slug rule character for character so the fallback
 * name is the SAME name.
 */

/**
 * The server's slug rule, mirrored: lowercase, every run of non-`[a-z0-9]`
 * collapsed to a single `-`, trimmed of `-`, and `cv` when nothing is left.
 */
export function cvFilenameSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "cv";
}

/** `<slug>.pdf` derived from the CV's own label. */
export function cvPdfFilename(name: string): string {
  return `${cvFilenameSlug(name)}.pdf`;
}

/** `<slug>.md` — the Markdown twin of `cvPdfFilename` (KODI-017 part 3). */
export function cvMarkdownFilename(name: string): string {
  return `${cvFilenameSlug(name)}.md`;
}

/** `<slug>-changes.md` — the diff export's Markdown filename fallback. */
export function cvDiffMarkdownFilename(name: string): string {
  return `${cvFilenameSlug(name)}-changes.md`;
}

/** `<slug>-changes.pdf` — the diff export's PDF filename fallback. */
export function cvDiffPdfFilename(name: string): string {
  return `${cvFilenameSlug(name)}-changes.pdf`;
}

/**
 * The filename out of a `Content-Disposition` header, or `null` when the header
 * is missing, carries no filename, or is malformed.
 *
 * `filename*` (RFC 5987) wins over `filename` when both are present, which is
 * what a non-ASCII CV label would arrive as.
 */
export function parseContentDispositionFilename(
  header?: string | null,
): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      const value = decodeURIComponent(extended[1].trim());
      if (value) return value;
    } catch {
      // A malformed percent-escape is not worth failing a download over.
    }
  }

  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const value = (plain?.[1] ?? plain?.[2] ?? "").trim();
  return value || null;
}

/**
 * Hand `blob` to the browser's download manager as `filename`.
 *
 * An object URL on a synthetic `<a download>` rather than `window.open`: the
 * bytes came back on an authenticated XHR, so there is no URL to navigate to,
 * and a popup blocker would eat the navigation anyway.
 *
 * The URL is revoked on the next tick, never synchronously after `click()` —
 * the download is started asynchronously and revoking too early truncates it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
