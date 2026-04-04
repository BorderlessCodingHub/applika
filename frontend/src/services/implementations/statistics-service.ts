import { api } from "@/lib/api-client";
import type { IStatisticsService } from "@/services/interfaces/i-statistics-service";
import type {
  GeneralStats,
  TrendPoint,
  ApiTrendPoint,
  StepConversion,
  StepAvgDays,
  PlatformStat,
  ModeStat,
} from "@/services/types/statistics";

function cycleParams(cycleId?: string | null) {
  return cycleId ? { cycle_id: cycleId } : {};
}

export class StatisticsService implements IStatisticsService {
  getGeneralStats(cycleId?: string | null): Promise<GeneralStats> {
    return api
      .get<GeneralStats>("/applications/statistics", {
        params: cycleParams(cycleId),
      })
      .then((r) => r.data);
  }

  getTrends(cycleId?: string | null): Promise<TrendPoint[]> {
    return api
      .get<ApiTrendPoint[]>("/applications/statistics/trends", {
        params: cycleParams(cycleId),
      })
      .then((r) =>
        r.data.map(
          (value) =>
            ({
              application_date: value.application_date,
              total_applications: value.total_applications,
              label: value.application_date.substring(5, 10),
            }) as TrendPoint
        )
      );
  }

  getStepConversion(cycleId?: string | null): Promise<StepConversion[]> {
    return api
      .get<StepConversion[]>("/applications/statistics/steps/conversion_rate", {
        params: cycleParams(cycleId),
      })
      .then((r) => r.data);
  }

  getStepAvgDays(cycleId?: string | null): Promise<StepAvgDays[]> {
    return api
      .get<StepAvgDays[]>("/applications/statistics/steps/avarage_days", {
        params: cycleParams(cycleId),
      })
      .then((r) => r.data);
  }

  getPlatformStats(cycleId?: string | null): Promise<PlatformStat[]> {
    return api
      .get<PlatformStat[]>("/applications/statistics/platforms", {
        params: cycleParams(cycleId),
      })
      .then((r) => r.data);
  }

  getModeStats(cycleId?: string | null): Promise<ModeStat> {
    return api
      .get<ModeStat>("/applications/statistics/mode", {
        params: cycleParams(cycleId),
      })
      .then((r) => r.data);
  }
}
