import { api } from "@/lib/api-client";
import type { ICycleService } from "@/services/interfaces/i-cycle-service";
import type { CreateCyclePayload, Cycle } from "@/services/types/cycles";

export class CycleService implements ICycleService {
  getCycles(): Promise<Cycle[]> {
    return api.get<Cycle[]>("/cycles").then((r) => r.data);
  }

  createCycle(data: CreateCyclePayload): Promise<Cycle> {
    return api.post<Cycle>("/cycles", data).then((r) => r.data);
  }

  deleteCycle(id: string): Promise<void> {
    return api.delete(`/cycles/${id}`).then(() => undefined);
  }
}
