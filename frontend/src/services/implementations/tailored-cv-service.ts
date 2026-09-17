import { api } from "@/lib/api-client";
import { parseContentDispositionFilename } from "@/lib/pdf-download";
import type { ITailoredCvService } from "@/services/interfaces/i-tailored-cv-service";
import type { CvPdfExport } from "@/services/types/cv-pdf";
import type {
  CreateTailoredCvPayload,
  TailoredCv,
  UpdateTailoredCvPayload,
} from "@/services/types/tailored-cv";

/**
 * `/applications/{id}/cv` — the application's CV copy.
 *
 * The write verbs carry the application's own state as errors: 409 when the
 * application is finalized (or already holds a copy) and 422 when it sits in a
 * closed cycle, matching how steps are refused today. `GET` carries neither —
 * a locked application's copy is always readable, which is what makes the
 * editor's read-only mode possible at all.
 *
 * `404` means "no copy yet", not an error: the page answers it with the picker.
 *
 * `POST /applications/{id}/cv/pdf` sits with `GET` on the readable side: it
 * carries no finalized/archived guard, so a locked copy still downloads.
 */
export class TailoredCvService implements ITailoredCvService {
  get(applicationId: string): Promise<TailoredCv> {
    return api
      .get<TailoredCv>(`/applications/${applicationId}/cv`)
      .then((r) => r.data);
  }

  create(
    applicationId: string,
    data: CreateTailoredCvPayload,
  ): Promise<TailoredCv> {
    return api
      .post<TailoredCv>(`/applications/${applicationId}/cv`, data)
      .then((r) => r.data);
  }

  update(
    applicationId: string,
    data: UpdateTailoredCvPayload,
  ): Promise<TailoredCv> {
    return api
      .put<TailoredCv>(`/applications/${applicationId}/cv`, data)
      .then((r) => r.data);
  }

  remove(applicationId: string): Promise<void> {
    return api
      .delete(`/applications/${applicationId}/cv`)
      .then(() => undefined);
  }

  exportPdf(applicationId: string): Promise<CvPdfExport> {
    return api
      .post<Blob>(`/applications/${applicationId}/cv/pdf`, undefined, {
        responseType: "blob",
      })
      .then((r) => ({
        blob: r.data,
        filename: parseContentDispositionFilename(
          r.headers["content-disposition"] as string | undefined,
        ),
      }));
  }
}
