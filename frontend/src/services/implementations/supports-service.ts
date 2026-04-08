import { api } from "@/lib/api-client";
import type { ISupportsService } from "@/services/interfaces/i-supports-service";
import type { Supports } from "@/services/types/supports";

export class SupportsService implements ISupportsService {
  getSupports(): Promise<Supports> {
    return api.get<Supports>("/supports").then((r) => r.data);
  }
}
