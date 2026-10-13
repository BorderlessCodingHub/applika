import { api } from "@/lib/api-client";
import type { IJobSearchService } from "@/services/interfaces/i-job-search-service";
import type {
  JobSearch,
  JobSearchCreate,
  JobSearchUpdate,
} from "@/services/types/job-searches";

export class JobSearchService implements IJobSearchService {
  list(): Promise<JobSearch[]> {
    return api.get<JobSearch[]>("/job-searches").then((r) => r.data);
  }

  create(data: JobSearchCreate): Promise<JobSearch> {
    return api.post<JobSearch>("/job-searches", data).then((r) => r.data);
  }

  update(id: string, data: JobSearchUpdate): Promise<JobSearch> {
    return api
      .put<JobSearch>(`/job-searches/${encodeURIComponent(id)}`, data)
      .then((r) => r.data);
  }

  remove(id: string): Promise<void> {
    return api
      .delete(`/job-searches/${encodeURIComponent(id)}`)
      .then(() => undefined);
  }
}
