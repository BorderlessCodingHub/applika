import type { MembershipBadgeKey } from "@/services/types/users";

export interface AdminPlatformStats {
  total_users: number;
  active_users_30d: number;
  total_applications: number;
  total_offers: number;
  total_denials: number;
  avg_applications_per_user: number;
  global_success_rate: number;
  new_users_7d: number;
  total_finalized: number;
  finalization_rate: number;
  applications_last_30d: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  /** A JSON number; `null` for a Borderless-only account. */
  github_id: number | null;
  seniority_level?: string;
  location?: string;
  is_admin: boolean;
  total_applications: number;
  offers: number;
  denials: number;
  active_applications: number;
  last_activity: string;
  joined_at: string;
}

export interface UserGrowthPoint {
  date: string;
  label: string;
  total_users: number;
  new_users: number;
}

export interface SeniorityBreakdown {
  level: string;
  count: number;
  color: string;
}

export interface SystemHealth {
  api_latency_ms: number;
  uptime_pct: number;
  error_rate_pct: number;
  db_connections: number;
  db_connections_max: number;
  cache_hit_rate: number;
  queue_depth: number;
  last_deploy: string;
}

export interface TopPlatformStat {
  name: string;
  total_across_users: number;
  unique_users: number;
}

export interface TopCompanyStat {
  name: string;
  total_across_users: number;
  unique_users: number;
}

export interface ActivityHeatmapPoint {
  hour: number;
  day: number;
  count: number;
}

export interface AdminUsersParams {
  search?: string;
  seniority?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminUserDetail extends AdminUserRow {
  first_name?: string;
  last_name?: string;
  current_role?: string;
  current_company?: string;
  bio?: string;
  linkedin_url?: string;
  tech_stack?: string[];
  availability?: string;
}

export interface AdminUpdateUser {
  is_admin?: boolean;
  seniority_level?: string;
  location?: string;
}

/** The nested creator shape (PRD 0010). `null` when the row has no recorded creator. */
export interface AdminCatalogCreatedBy {
  id: string;
  username: string;
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  applications_count: number;
  /** Legacy flat field, kept for the CLI. Prefer `created_by` on the web (PRD 0010). */
  created_by_username?: string;
  created_by?: AdminCatalogCreatedBy | null;
  is_public: boolean;
  created_at: string;
}

export type AdminCatalogVisibility = "public" | "private";

export interface AdminCompaniesParams {
  search?: string;
  is_active?: boolean;
  visibility?: AdminCatalogVisibility;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface CreateCompany {
  name: string;
  url: string;
}

export interface UpdateCompany {
  name?: string;
  url?: string;
  is_active?: boolean;
}

export interface AdminPlatform {
  id: string;
  name: string;
  url?: string | null;
  is_public: boolean;
  created_by?: AdminCatalogCreatedBy | null;
}

/** `GET /admin/platforms` row (PRD 0010, KODI-035): paginated, like `AdminCompanyRow`. */
export interface AdminPlatformRow {
  id: string;
  name: string;
  url: string | null;
  is_public: boolean;
  created_by?: AdminCatalogCreatedBy | null;
  applications_count: number;
  created_at: string;
}

export type PaginatedPlatforms = PaginatedResponse<AdminPlatformRow>;

export interface AdminPlatformsParams {
  search?: string;
  visibility?: AdminCatalogVisibility;
  sort_by?: "name" | "created_at" | "applications_count";
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

// AdminStepDefinition / AdminFeedbackDefinition removed (PRD 0008, ADR 0012,
// R-021): admins can no longer create, edit or delete step or feedback
// definitions — `/admin/step-definitions*` and `/admin/feedback-definitions*`
// now 404.

/**
 * Admin report webhook (`/admin/report-webhooks`, ADR-0024). A report goes to
 * the webhooks of its author's badge. `webhook_url_masked` is the only
 * address form the API returns; `badge` is null only on a row carried over
 * from before badges, which receives nothing until one is assigned.
 */
export interface AdminReportWebhook {
  id: string;
  label: string | null;
  badge: MembershipBadgeKey | null;
  webhook_url_masked: string;
  created_at: string;
  updated_at: string | null;
}

/** `POST /admin/report-webhooks` body. */
export interface CreateReportWebhook {
  webhook_url: string;
  badge: MembershipBadgeKey;
  label?: string | null;
}

/** `PATCH /admin/report-webhooks/{id}` body: only the keys present change; `badge` is never cleared. */
export interface UpdateReportWebhook {
  webhook_url?: string;
  badge?: MembershipBadgeKey;
  label?: string | null;
}

// ── Job sources (KODI-049, R-033..R-035) ────────────────────────────────

/** How a source's last run ended. `null` on the row until it first runs. */
export type AdminJobRunStatus = "ok" | "failed" | "blocked";

/** `GET /admin/jobs/sources` row. */
export interface AdminJobSource {
  id: string;
  code: string;
  name: string;
  base_url: string;
  platform_id: string | null;
  is_enabled: boolean;
  last_run_at: string | null;
  last_run_status: AdminJobRunStatus | null;
  last_run_error: string | null;
  last_run_found: number | null;
  last_run_saved: number | null;
  /** Listed (not removed) jobs from this source. */
  active_jobs: number;
}

/** `PATCH /admin/jobs/sources/{id}` body (`extra=forbid`, a strict bool). */
export interface UpdateAdminJobSource {
  is_enabled: boolean;
}

/** `POST /admin/jobs/runs` 202 body. 409 / 503 carry a `{detail}` instead. */
export interface AdminJobRunQueued {
  queued: true;
}
