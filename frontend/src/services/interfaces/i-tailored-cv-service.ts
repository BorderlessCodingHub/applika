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
}
