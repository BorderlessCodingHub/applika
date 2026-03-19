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

export class StatisticsService implements IStatisticsService {
  getGeneralStats(): Promise<GeneralStats> {
    return api
      .get<GeneralStats>("/applications/statistics")
      .then((r) => r.data);
  }

  getTrends(): Promise<TrendPoint[]> {
    return api
      .get<ApiTrendPoint[]>("/applications/statistics/trends")
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

  getStepConversion(): Promise<StepConversion[]> {
    return api
      .get<StepConversion[]>("/applications/statistics/steps/conversion_rate")
      .then((r) => r.data);
  }

  getStepAvgDays(): Promise<StepAvgDays[]> {
    return api
      .get<StepAvgDays[]>("/applications/statistics/steps/avarage_days")
      .then((r) => r.data);
  }

  getPlatformStats(): Promise<PlatformStat[]> {
    return api
      .get<PlatformStat[]>("/applications/statistics/platforms")
      .then((r) => r.data);
  }

  getModeStats(): Promise<ModeStat> {
    return api
      .get<ModeStat>("/applications/statistics/mode")
      .then((r) => r.data);
  }
}
