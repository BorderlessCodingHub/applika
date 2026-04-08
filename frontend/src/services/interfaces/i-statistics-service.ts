import type {
  GeneralStats,
  TrendPoint,
  StepConversion,
  StepAvgDays,
  PlatformStat,
  ModeStat,
} from "@/services/types/statistics";

export interface IStatisticsService {
  getGeneralStats(cycleId?: string | null): Promise<GeneralStats>;
  getTrends(cycleId?: string | null): Promise<TrendPoint[]>;
  getStepConversion(cycleId?: string | null): Promise<StepConversion[]>;
  getStepAvgDays(cycleId?: string | null): Promise<StepAvgDays[]>;
  getPlatformStats(cycleId?: string | null): Promise<PlatformStat[]>;
  getModeStats(cycleId?: string | null): Promise<ModeStat>;
}
