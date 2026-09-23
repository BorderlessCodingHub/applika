import type { CvPdfExport } from "@/services/types/cv-pdf";
import type {
  CreateTailoredCvPayload,
  TailoredCv,
  UpdateTailoredCvPayload,
} from "@/services/types/tailored-cv";

/**
 * An application holds at most one CV copy, so every call is keyed by the
 * APPLICATION id — there is no copy id to address and no list to page through.
 */
export interface ITailoredCvService {
  get(applicationId: string): Promise<TailoredCv>;
  create(
    applicationId: string,
    data: CreateTailoredCvPayload,
  ): Promise<TailoredCv>;
  update(
    applicationId: string,
    data: UpdateTailoredCvPayload,
  ): Promise<TailoredCv>;
  remove(applicationId: string): Promise<void>;
  /**
   * Ask the server to typeset this CV copy (ADR 0011). No body and no theme
   * parameter. Unlike the write verbs it carries NO finalized/archived guard:
   * a locked copy still downloads, which is half of what makes it readable.
   */
  exportPdf(applicationId: string): Promise<CvPdfExport>;
  /** The same copy as Markdown (KODI-017 part 3), `GET .../cv/markdown`. */
  exportMarkdown(applicationId: string): Promise<CvPdfExport>;
  /**
   * The diff between the copy and its baseline, as Markdown
   * (`GET .../cv/diff/markdown`). 409s with "This CV copy has no baseline to
   * compare with." when neither `base_snapshot` nor `base_cv_id` resolves.
   */
  exportDiffMarkdown(applicationId: string): Promise<CvPdfExport>;
  /** The same diff, typeset as a PDF (`GET .../cv/diff/pdf`). Same 409. */
  exportDiffPdf(applicationId: string): Promise<CvPdfExport>;
}
