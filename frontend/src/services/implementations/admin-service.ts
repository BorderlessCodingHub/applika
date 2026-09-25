import { api } from "@/lib/api-client";
import type {
  ActivityHeatmapPoint,
  AdminCompaniesParams,
  AdminCompanyRow,
  AdminDiscordWebhook,
  AdminPlatform,
  AdminPlatformStats,
  AdminUpdateUser,
  AdminUserDetail,
  AdminUserRow,
  AdminUsersParams,
  CreateCompany,
  CreateDiscordWebhook,
  PaginatedResponse,
  SeniorityBreakdown,
  TopCompanyStat,
  TopPlatformStat,
  UpdateCompany,
  UpdateDiscordWebhook,
  UserGrowthPoint,
} from "@/services/types/admin";

export class AdminService {
  // ── Dashboard Analytics ───────────────────────────────────────────

  getStats(): Promise<AdminPlatformStats> {
    return api.get<AdminPlatformStats>("/admin/stats").then((r) => r.data);
  }

  getUsers(
    params?: AdminUsersParams,
  ): Promise<PaginatedResponse<AdminUserRow>> {
    return api
      .get<PaginatedResponse<AdminUserRow>>("/admin/users", { params })
      .then((r) => r.data);
  }

  getUserGrowth(): Promise<UserGrowthPoint[]> {
    return api
      .get<UserGrowthPoint[]>("/admin/users/growth")
      .then((r) => r.data);
  }

  getSeniorityBreakdown(): Promise<SeniorityBreakdown[]> {
    return api
      .get<SeniorityBreakdown[]>("/admin/users/seniority")
      .then((r) => r.data);
  }

  getTopPlatforms(): Promise<TopPlatformStat[]> {
    return api
      .get<TopPlatformStat[]>("/admin/stats/top-platforms")
      .then((r) => r.data);
  }

  getTopCompanies(): Promise<TopCompanyStat[]> {
    return api
      .get<TopCompanyStat[]>("/admin/stats/top-companies")
      .then((r) => r.data);
  }

  getActivityHeatmap(): Promise<ActivityHeatmapPoint[]> {
    return api
      .get<ActivityHeatmapPoint[]>("/admin/stats/activity-heatmap")
      .then((r) => r.data);
  }

  // ── User Management ───────────────────────────────────────────────

  getUser(id: string): Promise<AdminUserDetail> {
    return api.get<AdminUserDetail>(`/admin/users/${id}`).then((r) => r.data);
  }

  updateUser(id: string, data: AdminUpdateUser): Promise<AdminUserDetail> {
    return api
      .patch<AdminUserDetail>(`/admin/users/${id}`, data)
      .then((r) => r.data);
  }

  // ── Company Management ────────────────────────────────────────────

  getCompanies(
    params?: AdminCompaniesParams,
  ): Promise<PaginatedResponse<AdminCompanyRow>> {
    return api
      .get<PaginatedResponse<AdminCompanyRow>>("/admin/companies", { params })
      .then((r) => r.data);
  }

  createCompany(data: CreateCompany): Promise<AdminCompanyRow> {
    return api
      .post<AdminCompanyRow>("/admin/companies", data)
      .then((r) => r.data);
  }

  updateCompany(id: string, data: UpdateCompany): Promise<AdminCompanyRow> {
    return api
      .patch<AdminCompanyRow>(`/admin/companies/${id}`, data)
      .then((r) => r.data);
  }

  deleteCompany(id: string): Promise<void> {
    return api.delete(`/admin/companies/${id}`).then(() => undefined);
  }

  // ── Supports: Platforms ───────────────────────────────────────────

  getPlatforms(): Promise<AdminPlatform[]> {
    return api.get<AdminPlatform[]>("/admin/platforms").then((r) => r.data);
  }

  createPlatform(data: { name: string; url?: string }): Promise<AdminPlatform> {
    return api
      .post<AdminPlatform>("/admin/platforms", data)
      .then((r) => r.data);
  }

  updatePlatform(
    id: string,
    data: { name: string; url?: string },
  ): Promise<AdminPlatform> {
    return api
      .patch<AdminPlatform>(`/admin/platforms/${id}`, data)
      .then((r) => r.data);
  }

  deletePlatform(id: string): Promise<void> {
    return api.delete(`/admin/platforms/${id}`).then(() => undefined);
  }

  // Step/feedback definition CRUD removed (PRD 0008, ADR 0012, R-021):
  // `/admin/step-definitions*` and `/admin/feedback-definitions*` now 404 —
  // the web must never call them.

  // ── Report webhooks (KODI-027) ──────────────────────────────────────

  getDiscordWebhooks(): Promise<AdminDiscordWebhook[]> {
    return api
      .get<AdminDiscordWebhook[]>("/admin/discord-webhooks")
      .then((r) => r.data);
  }

  createDiscordWebhook(
    data: CreateDiscordWebhook,
  ): Promise<AdminDiscordWebhook> {
    return api
      .post<AdminDiscordWebhook>("/admin/discord-webhooks", data)
      .then((r) => r.data);
  }

  updateDiscordWebhook(
    id: string,
    data: UpdateDiscordWebhook,
  ): Promise<AdminDiscordWebhook> {
    return api
      .patch<AdminDiscordWebhook>(`/admin/discord-webhooks/${id}`, data)
      .then((r) => r.data);
  }

  deleteDiscordWebhook(id: string): Promise<void> {
    return api.delete(`/admin/discord-webhooks/${id}`).then(() => undefined);
  }
}
