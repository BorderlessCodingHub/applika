import type { CreateCyclePayload, Cycle } from "@/services/types/cycles";

export interface ICycleService {
  getCycles(): Promise<Cycle[]>;
  createCycle(data: CreateCyclePayload): Promise<Cycle>;
  deleteCycle(id: string): Promise<void>;
}
