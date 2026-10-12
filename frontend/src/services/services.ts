import { AdminService } from "./implementations/admin-service";
import { BaseCvService } from "./implementations/base-cv-service";
import { CycleService } from "./implementations/cycle-service";
import { FeedbackService } from "./implementations/feedback-service";
import { AuthService } from "./implementations/auth-service";
import { UserService } from "@/services/implementations/user-service";
import { ApplicationService } from "@/services/implementations/application-service";
import { ApplicationDraftService } from "@/services/implementations/application-draft-service";
import { StatisticsService } from "@/services/implementations/statistics-service";
import { SupportsService } from "@/services/implementations/supports-service";
import { CompanyService } from "@/services/implementations/company-service";
import { PlatformService } from "@/services/implementations/platform-service";
import { ReportsService } from "@/services/implementations/reports-service";
import { TailoredCvService } from "@/services/implementations/tailored-cv-service";
import { TimelineService } from "@/services/implementations/timeline-service";
import { JobService } from "@/services/implementations/job-service";
import { JobSearchService } from "@/services/implementations/job-search-service";

class ServiceContainer {
  admin = new AdminService();
  auth = new AuthService();
  users = new UserService();
  applications = new ApplicationService();
  applicationDrafts = new ApplicationDraftService();
  statistics = new StatisticsService();
  supports = new SupportsService();
  companies = new CompanyService();
  platforms = new PlatformService();
  reports = new ReportsService();
  feedbacks = new FeedbackService();
  cycles = new CycleService();
  baseCvs = new BaseCvService();
  tailoredCvs = new TailoredCvService();
  timeline = new TimelineService();
  jobs = new JobService();
  jobSearches = new JobSearchService();
}

export const services = new ServiceContainer();
