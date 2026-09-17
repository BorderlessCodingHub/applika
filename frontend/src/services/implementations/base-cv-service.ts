import { api } from "@/lib/api-client";
import type { IBaseCvService } from "@/services/interfaces/i-base-cv-service";
import type {
  BaseCv,
  CreateBaseCvPayload,
  UpdateBaseCvPayload,
} from "@/services/types/base-cv";

/**
 * `/base-cvs` — the master CV endpoints.
 *
 * `POST` answers 409 with `{detail}` when the user already holds the maximum
 * number of master CVs; the caller surfaces that message. `DELETE` never 409s.
 */
export class BaseCvService implements IBaseCvService {
  list(): Promise<BaseCv[]> {
    return api.get<BaseCv[]>("/base-cvs").then((r) => r.data);
  }

  get(id: string): Promise<BaseCv> {
    return api.get<BaseCv>(`/base-cvs/${id}`).then((r) => r.data);
  }

  create(data: CreateBaseCvPayload): Promise<BaseCv> {
    return api.post<BaseCv>("/base-cvs", data).then((r) => r.data);
  }

  update(id: string, data: UpdateBaseCvPayload): Promise<BaseCv> {
    return api.patch<BaseCv>(`/base-cvs/${id}`, data).then((r) => r.data);
  }

  remove(id: string): Promise<void> {
    return api.delete(`/base-cvs/${id}`).then(() => undefined);
  }
}
