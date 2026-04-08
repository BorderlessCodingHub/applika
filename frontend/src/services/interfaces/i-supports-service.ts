import type { Supports } from "@/services/types/supports";

export interface ISupportsService {
  getSupports(): Promise<Supports>;
}
