import { api } from "@/lib/api-client";
import type {
  ActivityHeatmapPoint,
  AdminCompaniesParams,
  AdminCompanyRow,
  AdminDiscordWebhook,
  AdminJobRunQueued,
  AdminJobSource,
  AdminPlatform,
  AdminPlatformsParams,
  AdminPlatformStats,
  AdminUpdateUser,
  AdminUserDetail,
  AdminUserRow,
  AdminUsersParams,
  CreateCompany,
  CreateDiscordWebhook,
  PaginatedPlatforms,
  PaginatedResponse,
  SeniorityBreakdown,
  TopCompanyStat,
  TopPlatformStat,
  UpdateCompany,
  UpdateAdminJobSource,
  UpdateDiscordWebhook,
  UserGrowthPoint,
} from "@/services/types/admin";
import type {
  AdminFeature,
  AdminFeatureUsersPage,
  AdminFeatureUsersParams,
  FeatureStage,
} from "@/services/types/features";

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

  /** `POST /admin/companies/{id}/publish` — 200 (idempotent) | 404 | 409 with the colliding row's detail. */
  publishCompany(id: string): Promise<AdminCompanyRow> {
    return api
      .post<AdminCompanyRow>(`/admin/companies/${id}/publish`)
      .then((r) => r.data);
  }

  // ── Supports: Platforms ───────────────────────────────────────────

  getPlatforms(params?: AdminPlatformsParams): Promise<PaginatedPlatforms> {
    return api
      .get<PaginatedPlatforms>("/admin/platforms", { params })
      .then((r) => r.data);
  }

  /** `POST /admin/platforms/{id}/publish` — same contract as `publishCompany`. */
  publishPlatform(id: string): Promise<AdminPlatform> {
    return api
      .post<AdminPlatform>(`/admin/platforms/${id}/publish`)
      .then((r) => r.data);
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

  // ── Job sources (KODI-049) ──────────────────────────────────────────

  getJobSources(): Promise<AdminJobSource[]> {
    return api.get<AdminJobSource[]>("/admin/jobs/sources").then((r) => r.data);
  }

  /** R-034: a source that is off is skipped by every run. */
  updateJobSource(
    id: string,
    data: UpdateAdminJobSource,
  ): Promise<AdminJobSource> {
    return api
      .patch<AdminJobSource>(`/admin/jobs/sources/${id}`, data)
      .then((r) => r.data);
  }

  /** R-035: 202 queues a run; 409 "A run is already in progress"; 503 "Background service unavailable". */
  startJobRun(): Promise<AdminJobRunQueued> {
    return api.post<AdminJobRunQueued>("/admin/jobs/runs").then((r) => r.data);
  }

  // ── Beta features (KODI-052 API, KODI-054) ──────────────────────────

  /** `GET /admin/features`: every feature with its count, release date and the caller's own access. */
  getFeatures(): Promise<AdminFeature[]> {
    return api.get<AdminFeature[]>("/admin/features").then((r) => r.data);
  }

  /** `GET /admin/features/{key}/users`: the beta list, newest first; 404 "Feature not found". */
  getFeatureUsers(
    key: string,
    params?: AdminFeatureUsersParams,
  ): Promise<AdminFeatureUsersPage> {
    return api
      .get<AdminFeatureUsersPage>(
        `/admin/features/${encodeURIComponent(key)}/users`,
        { params },
      )
      .then((r) => r.data);
  }

  /** `PUT …/users/{user_id}`: 204, idempotent; 404 "Feature not found" | "User not found". */
  addFeatureUser(key: string, userId: string): Promise<void> {
    return api
      .put(`/admin/features/${encodeURIComponent(key)}/users/${userId}`)
      .then(() => undefined);
  }

  /** `DELETE …/users/{user_id}`: 204, idempotent; 404 "Feature not found". */
  removeFeatureUser(key: string, userId: string): Promise<void> {
    return api
      .delete(`/admin/features/${encodeURIComponent(key)}/users/${userId}`)
      .then(() => undefined);
  }

  /** `PATCH /admin/features/{key}` `{stage}`: release, or move back to beta. The list is kept. */
  setFeatureStage(key: string, stage: FeatureStage): Promise<AdminFeature> {
    return api
      .patch<AdminFeature>(`/admin/features/${encodeURIComponent(key)}`, {
        stage,
      })
      .then((r) => r.data);
  }

  /** `PUT …/opt-out`: the caller turns the feature off for themselves only. */
  optOutFeature(key: string): Promise<void> {
    return api
      .put(`/admin/features/${encodeURIComponent(key)}/opt-out`)
      .then(() => undefined);
  }

  /** `DELETE …/opt-out`: the caller turns it back on. */
  optInFeature(key: string): Promise<void> {
    return api
      .delete(`/admin/features/${encodeURIComponent(key)}/opt-out`)
      .then(() => undefined);
  }
}
