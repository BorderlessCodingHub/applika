import {
  Briefcase,
  Building,
  Calendar,
  Code,
  Eye,
  MapPin,
  Pencil,
} from "lucide-react";
import { Button } from "../ui/button";
import { InfoItem, UserProfileAvatar } from "./sub-components";
import { Star, Flame, Target, Award, Trophy, Zap } from "lucide-react";
import { AvailabilityType, User } from "@/services/types/users";
import { GeneralStats } from "@/services/types/statistics";
import { SelectOptions } from "@/options";
import { LinkedinIcon } from "../brand-icons";
import { Badge } from "../ui/badge";
import { getCurrencySymbol } from "./edit-form-config";

function formatLabel(v?: string) {
  return v?.replace(/_/g, " ") ?? "";
}

interface UserProfileViewProps {
  user: User;
  userStats?: GeneralStats;
  onEditClick: () => void;
}

const AVAILABILITY_STYLES: Record<AvailabilityType, string> = {
  open_to_work: "bg-success/15 text-success border-success/30",
  casually_looking: "bg-warning/15 text-warning border-warning/30",
  not_looking: "bg-muted text-muted-foreground border-border",
};

export function UserProfileView({
  user,
  userStats,
  onEditClick,
}: UserProfileViewProps) {
  const badges = computeBadges(userStats);
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);
  const currencySymbol = getCurrencySymbol(user.salary_currency);
  const periodLabel =
    SelectOptions.SALARY_PERIOD.find(
      (o) => o.value === user.salary_period,
    )?.label?.toLowerCase() ?? "";

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
      {/* Header card */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <div className="-mt-12 px-6 pb-6">
          <div className="flex items-end justify-between">
            <UserProfileAvatar user={user} />
            <Button
              variant="outline"
              size="sm"
              className="mb-1 gap-1.5"
              onClick={onEditClick}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {user.first_name || user.last_name
                  ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
                  : user.username}
              </h1>
              {user.availability && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${AVAILABILITY_STYLES[user.availability] ?? AVAILABILITY_STYLES.not_looking}`}
                >
                  {formatLabel(user.availability)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            {user.current_role && (
              <p className="mt-1 text-sm text-muted-foreground">
                {user.current_role}
                {user.current_company && (
                  <span>
                    {" "}
                    at{" "}
                    <span className="font-medium text-foreground">
                      {user.current_company}
                    </span>
                  </span>
                )}
              </p>
            )}
            {user.bio && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {user.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="rounded-xl bg-card p-6 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {user.current_company && (
            <InfoItem
              icon={Building}
              label="Company"
              value={user.current_company}
            />
          )}
          {user.current_salary != null && (
            <InfoItem
              icon={Briefcase}
              label="Salary"
              value={`${currencySymbol}${user.current_salary.toLocaleString()}${periodLabel ? ` / ${periodLabel}` : ""}`}
              tabular
            />
          )}
          {user.seniority_level && (
            <InfoItem
              icon={Award}
              label="Seniority"
              value={formatLabel(user.seniority_level)}
              capitalize
            />
          )}
          {user.experience_years != null && (
            <InfoItem
              icon={Calendar}
              label="Experience"
              value={`${user.experience_years} year${user.experience_years !== 1 ? "s" : ""}`}
              tabular
            />
          )}
          {user.location && (
            <InfoItem icon={MapPin} label="Location" value={user.location} />
          )}
          {user.linkedin_url && (
            <div className="flex items-start gap-2">
              <LinkedinIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground">LinkedIn</span>
                <a
                  href={user.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-[180px] truncate text-sm text-primary hover:underline"
                >
                  Profile
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tech Stack */}
      {user.tech_stack && user.tech_stack.length > 0 && (
        <div className="rounded-xl bg-card p-6 shadow-card">
          <div className="mb-3 flex items-center gap-1.5">
            <Code className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Tech Stack
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {user.tech_stack.map((tech) => (
              <Badge key={tech} variant="secondary" className="text-xs">
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      <div className="rounded-xl bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Badges</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {earnedBadges.length}/{badges.length} earned
          </span>
        </div>
        {earnedBadges.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {earnedBadges.map((b) => (
              <div
                key={b.id}
                className="hover:shadow-elevated flex items-center gap-2.5 rounded-lg border border-border bg-accent/50 p-3 transition-shadow"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${b.color}20` }}
                >
                  <b.icon className="h-4.5 w-4.5" style={{ color: b.color }} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {b.label}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {b.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {lockedBadges.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {lockedBadges.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 p-3 opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-muted-foreground">
                    {b.label}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {b.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BadgeDef {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  earned: boolean;
  color: string;
}

function computeBadges(stats?: {
  total_applications: number;
  success_rate: number;
  offers: number;
  denials: number;
}): BadgeDef[] {
  const t = stats?.total_applications ?? 0;
  const o = stats?.offers ?? 0;
  const sr = stats?.success_rate ?? 0;

  return [
    {
      id: "first_app",
      label: "First Step",
      description: "Created your first application",
      icon: Star,
      earned: t >= 1,
      color: "hsl(38 92% 50%)",
    },
    {
      id: "ten_apps",
      label: "Getting Serious",
      description: "10 applications submitted",
      icon: Flame,
      earned: t >= 10,
      color: "hsl(15 80% 55%)",
    },
    {
      id: "fifty_apps",
      label: "Persistence",
      description: "50 applications submitted",
      icon: Target,
      earned: t >= 50,
      color: "hsl(262 60% 55%)",
    },
    {
      id: "hundred_apps",
      label: "Centurion",
      description: "100 applications submitted",
      icon: Award,
      earned: t >= 100,
      color: "hsl(220 90% 50%)",
    },
    {
      id: "first_offer",
      label: "First Offer",
      description: "Received your first offer",
      icon: Trophy,
      earned: o >= 1,
      color: "hsl(142 71% 45%)",
    },
    {
      id: "high_rate",
      label: "Sharpshooter",
      description: "Achieved 20%+ success rate",
      icon: Zap,
      earned: sr >= 20 && t >= 5,
      color: "hsl(48 96% 53%)",
    },
  ];
}
