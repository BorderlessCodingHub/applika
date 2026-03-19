import type {
  GeneralStats,
  TrendPoint,
  StepConversion,
  StepAvgDays,
  PlatformStat,
  ModeStat,
} from "@/services/types/statistics";

export interface IStatisticsService {
  getGeneralStats(): Promise<GeneralStats>;
  getTrends(): Promise<TrendPoint[]>;
  getStepConversion(): Promise<StepConversion[]>;
  getStepAvgDays(): Promise<StepAvgDays[]>;
  getPlatformStats(): Promise<PlatformStat[]>;
  getModeStats(): Promise<ModeStat>;
}
