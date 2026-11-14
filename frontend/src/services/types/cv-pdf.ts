/**
 * What a CV PDF export brings back off the wire.
 *
 * Shared by the master CV and the CV copy: both routes answer the same way —
 * `application/pdf` bytes plus a `Content-Disposition` naming the file — so
 * both services return this one shape.
 */
export interface CvPdfExport {
  /** The `application/pdf` bytes exactly as the server typeset them. */
  blob: Blob;
  /**
   * The filename the server chose, or `null` when `Content-Disposition` was
   * missing or unparseable. The caller falls back to `cvPdfFilename(cv.name)`,
   * which mirrors the server's slug rule.
   */
  filename: string | null;
}
