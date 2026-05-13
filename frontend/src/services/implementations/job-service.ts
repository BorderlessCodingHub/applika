import { api } from "@/lib/api-client";
import type { Application } from "@/services/types/applications";
import type {
  AtsReport,
  JobDetail,
  JobFilters,
  JobListResponse,
  TailoredDocument,
  UserResume,
} from "@/services/types/jobs";
import type { IJobService } from "@/services/interfaces/i-job-service";

export class JobService implements IJobService {
  getJobs(filters?: JobFilters): Promise<JobListResponse> {
    return api
      .get<JobListResponse>("/jobs", { params: filters ?? {} })
      .then((r) => r.data);
  }

  getJob(id: string): Promise<JobDetail> {
    return api.get<JobDetail>(`/jobs/${id}`).then((r) => r.data);
  }

  createApplicationFromJob(jobId: string): Promise<Application> {
    return api
      .post<Application>(`/jobs/${jobId}/applications`)
      .then((r) => r.data);
  }

  getResumes(): Promise<UserResume[]> {
    return api.get<UserResume[]>("/users/me/resumes").then((r) => r.data);
  }

  uploadResume(file: File): Promise<UserResume> {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<UserResume>("/users/me/resumes", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  }

  setDefaultResume(resumeId: string): Promise<UserResume> {
    return api
      .patch<UserResume>(`/users/me/resumes/${resumeId}`, { is_default: true })
      .then((r) => r.data);
  }

  deleteResume(resumeId: string): Promise<void> {
    return api
      .delete(`/users/me/resumes/${resumeId}`)
      .then((r) => r.data);
  }

  tailorCv(jobId: string): Promise<TailoredDocument> {
    return api
      .post<TailoredDocument>(`/jobs/${jobId}/tailor-cv`)
      .then((r) => r.data);
  }

  getTailoredDocument(documentId: string): Promise<TailoredDocument> {
    return api
      .get<TailoredDocument>(`/tailored-documents/${documentId}`)
      .then((r) => r.data);
  }

  getAtsReport(documentId: string): Promise<AtsReport> {
    return api
      .get<AtsReport>(`/tailored-documents/${documentId}/ats`)
      .then((r) => r.data);
  }

  refreshFit(): Promise<{ status: string }> {
    return api
      .post<{ status: string }>("/jobs/fit/refresh")
      .then((r) => r.data);
  }
}
