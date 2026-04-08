export interface AdminPlatformStats {
  total_users: number;
  active_users_30d: number;
  total_applications: number;
  total_offers: number;
  total_denials: number;
  avg_applications_per_user: number;
  global_success_rate: number;
  new_users_7d: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  github_id: string;
  seniority_level?: string;
  location?: string;
  total_applications: number;
  offers: number;
  denials: number;
  active_applications: number;
  last_activity: string; // ISO date
  joined_at: string; // ISO date
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

export interface ActivityHeatmapPoint {
  hour: number;
  day: number; // 0=Mon, 6=Sun
  count: number;
}
