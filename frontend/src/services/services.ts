import { AdminService } from "./implementations/admin-service";
import { CycleService } from "./implementations/cycle-service";
import { FeedbackService } from "./implementations/feedback-service";
import { AuthService } from "./implementations/auth-service";
import { UserService } from "@/services/implementations/user-service";
import { ApplicationService } from "@/services/implementations/application-service";
import { StatisticsService } from "@/services/implementations/statistics-service";
import { SupportsService } from "@/services/implementations/supports-service";
import { CompanyService } from "@/services/implementations/company-service";
import { ReportsService } from "@/services/implementations/reports-service";

class ServiceContainer {
  admin = new AdminService();
  auth = new AuthService();
  users = new UserService();
  applications = new ApplicationService();
  statistics = new StatisticsService();
  supports = new SupportsService();
  companies = new CompanyService();
  reports = new ReportsService();
  feedbacks = new FeedbackService();
  cycles = new CycleService();
}

export const services = new ServiceContainer();
