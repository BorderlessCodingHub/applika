import type { Application } from "../types/applications";
import type {
  AtsReport,
  JobDetail,
  JobFilters,
  JobListResponse,
  TailoredDocument,
  UserResume,
} from "../types/jobs";

export interface IJobService {
  getJobs(filters?: JobFilters): Promise<JobListResponse>;
  getJob(id: string): Promise<JobDetail>;
  createApplicationFromJob(jobId: string): Promise<Application>;
  getResumes(): Promise<UserResume[]>;
  uploadResume(file: File): Promise<UserResume>;
  setDefaultResume(resumeId: string): Promise<UserResume>;
  deleteResume(resumeId: string): Promise<void>;
  tailorCv(jobId: string): Promise<TailoredDocument>;
  getTailoredDocument(documentId: string): Promise<TailoredDocument>;
  getAtsReport(documentId: string): Promise<AtsReport>;
  refreshFit(): Promise<{ status: string }>;
}
