import type { CvPdfExport } from "@/services/types/cv-pdf";
import type {
  BaseCv,
  CreateBaseCvPayload,
  UpdateBaseCvPayload,
} from "@/services/types/base-cv";

export interface IBaseCvService {
  list(): Promise<BaseCv[]>;
  get(id: string): Promise<BaseCv>;
  create(data: CreateBaseCvPayload): Promise<BaseCv>;
  update(id: string, data: UpdateBaseCvPayload): Promise<BaseCv>;
  remove(id: string): Promise<void>;
  /**
   * Ask the server to typeset this master CV (ADR 0011). No body and no theme
   * parameter: the theme is fixed `applika` and the user does not choose it.
   */
  exportPdf(id: string): Promise<CvPdfExport>;
}
