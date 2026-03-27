import type {
  AdminPlatformStats,
  AdminUserRow,
  UserGrowthPoint,
  SeniorityBreakdown,
  SystemHealth,
  TopPlatformStat,
  ActivityHeatmapPoint,
} from "@/services/types/admin";

// ── Mock data generators ───────────────────────────────────────────

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const USERNAMES = [
  "devcarla",
  "jmartinez_io",
  "sarah.codes",
  "alexrusso",
  "priya_builds",
  "marcelo.dev",
  "kchen92",
  "natalieWang",
  "tomasF",
  "elena_kr",
  "joaopedro_",
  "mika.tsx",
  "danielsouza",
  "lucasfranca",
  "anamaria.dev",
  "rafaelcosta",
  "brunosantos",
  "giulia_js",
  "pedrohenrique",
  "isadoralima",
];

const LOCATIONS = [
  "São Paulo, BR",
  "San Francisco, US",
  "Berlin, DE",
  "London, UK",
  "Toronto, CA",
  "Lisbon, PT",
  "Amsterdam, NL",
  "Tokyo, JP",
  "Melbourne, AU",
  "Buenos Aires, AR",
];

const SENIORITY = [
  "intern",
  "junior",
  "mid_level",
  "senior",
  "staff",
  "lead",
  "principal",
];

function generateMockUsers(): AdminUserRow[] {
  return USERNAMES.map((username, i) => {
    const total = randomBetween(3, 85);
    const offers = randomBetween(0, Math.min(total, 6));
    const denials = randomBetween(0, Math.min(total - offers, 15));
    const daysAgo = randomBetween(0, 180);
    const joinedDaysAgo = randomBetween(daysAgo + 1, 365);

    return {
      id: String(i + 1),
      username,
      email: `${username.replace(/[._]/g, "")}@email.com`,
      github_id: String(10000 + i),
      seniority_level: SENIORITY[randomBetween(0, SENIORITY.length - 1)],
      location: LOCATIONS[randomBetween(0, LOCATIONS.length - 1)],
      total_applications: total,
      offers,
      denials,
      active_applications: total - offers - denials,
      last_activity: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      joined_at: new Date(Date.now() - joinedDaysAgo * 86400000).toISOString(),
    };
  });
}

function generateGrowthData(): UserGrowthPoint[] {
  const points: UserGrowthPoint[] = [];
  let cumulative = 3;
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const newUsers = randomBetween(1, 6);
    cumulative += newUsers;
    points.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      total_users: cumulative,
      new_users: newUsers,
    });
  }
  return points;
}

function generateHeatmap(): ActivityHeatmapPoint[] {
  const points: ActivityHeatmapPoint[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const isWeekday = day < 5;
      const isWorkHour = hour >= 9 && hour <= 18;
      const base = isWeekday ? (isWorkHour ? 8 : 2) : 1;
      points.push({ hour, day, count: randomBetween(0, base) });
    }
  }
  return points;
}

// ── Cached mock data (stable across re-renders) ───────────────────

let _cachedUsers: AdminUserRow[] | null = null;
let _cachedGrowth: UserGrowthPoint[] | null = null;
let _cachedHeatmap: ActivityHeatmapPoint[] | null = null;

function getCachedUsers() {
  if (!_cachedUsers) _cachedUsers = generateMockUsers();
  return _cachedUsers;
}

function getCachedGrowth() {
  if (!_cachedGrowth) _cachedGrowth = generateGrowthData();
  return _cachedGrowth;
}

function getCachedHeatmap() {
  if (!_cachedHeatmap) _cachedHeatmap = generateHeatmap();
  return _cachedHeatmap;
}

// ── Mock API functions (swap for real endpoints later) ─────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getAdminPlatformStats(): Promise<AdminPlatformStats> {
  await delay(400);
  const users = getCachedUsers();
  const totalApps = users.reduce((s, u) => s + u.total_applications, 0);
  const totalOffers = users.reduce((s, u) => s + u.offers, 0);
  const totalDenials = users.reduce((s, u) => s + u.denials, 0);

  return {
    total_users: users.length,
    active_users_30d: users.filter(
      (u) => Date.now() - new Date(u.last_activity).getTime() < 30 * 86400000
    ).length,
    total_applications: totalApps,
    total_offers: totalOffers,
    total_denials: totalDenials,
    avg_applications_per_user: Math.round((totalApps / users.length) * 10) / 10,
    global_success_rate:
      totalApps > 0 ? Math.round((totalOffers / totalApps) * 1000) / 10 : 0,
    new_users_7d: randomBetween(2, 5),
  };
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  await delay(500);
  return getCachedUsers();
}

export async function getUserGrowth(): Promise<UserGrowthPoint[]> {
  await delay(350);
  return getCachedGrowth();
}

export async function getSeniorityBreakdown(): Promise<SeniorityBreakdown[]> {
  await delay(300);
  const users = getCachedUsers();
  const counts: Record<string, number> = {};
  users.forEach((u) => {
    const level = u.seniority_level || "unknown";
    counts[level] = (counts[level] || 0) + 1;
  });

  const colors: Record<string, string> = {
    intern: "#94a3b8",
    junior: "#60a5fa",
    mid_level: "#34d399",
    senior: "#f59e0b",
    staff: "#f97316",
    lead: "#ef4444",
    principal: "#a855f7",
    unknown: "#6b7280",
  };

  return Object.entries(counts).map(([level, count]) => ({
    level: level.replace("_", " "),
    count,
    color: colors[level] || "#6b7280",
  }));
}

export async function getSystemHealth(): Promise<SystemHealth> {
  await delay(250);
  return {
    api_latency_ms: randomBetween(12, 45),
    uptime_pct: 99.0 + Math.random() * 0.99,
    error_rate_pct: Math.random() * 0.5,
    db_connections: randomBetween(8, 22),
    db_connections_max: 50,
    cache_hit_rate: 85 + Math.random() * 14,
    queue_depth: randomBetween(0, 12),
    last_deploy: new Date(
      Date.now() - randomBetween(1, 72) * 3600000
    ).toISOString(),
  };
}

export async function getTopPlatforms(): Promise<TopPlatformStat[]> {
  await delay(300);
  return [
    { name: "LinkedIn", total_across_users: 142, unique_users: 18 },
    { name: "Indeed", total_across_users: 87, unique_users: 14 },
    { name: "Company Website", total_across_users: 63, unique_users: 12 },
    { name: "Glassdoor", total_across_users: 41, unique_users: 9 },
    { name: "AngelList", total_across_users: 28, unique_users: 7 },
    { name: "Referral", total_across_users: 22, unique_users: 11 },
  ];
}

export async function getActivityHeatmap(): Promise<ActivityHeatmapPoint[]> {
  await delay(350);
  return getCachedHeatmap();
}
