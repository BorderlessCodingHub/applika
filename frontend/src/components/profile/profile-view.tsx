import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Briefcase,
  Building,
  Calendar,
  Code,
  Eye,
  MapPin,
  Pencil,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { InfoItem, UserProfileAvatar } from "./sub-components";
import { Star, Flame, Target, Award, Trophy, Zap } from "lucide-react";
import { AvailabilityType, User } from "@/services/types/users";
import { GeneralStats } from "@/services/types/statistics";
import { SelectOptions } from "@/options";
import { LinkedinIcon } from "../brand-icons";
import { Badge } from "../ui/badge";
import { getCurrencySymbol } from "./edit-form-config";
import { useDeleteAccount } from "@/hooks/use-user";
import { useStartGithubRestore } from "@/hooks/use-github-restore";
import {
  MembershipBadge,
  membershipAccess,
} from "@/components/badges/membership-badge";
import { ConfirmMembershipNotice } from "./confirm-membership-notice";
import { GithubRestoreCard } from "./github-restore-card";
import { useIntlLocale } from "@/i18n/intl-locale";

function formatLabel(v?: string) {
  return v?.replace(/_/g, " ") ?? "";
}

/** An option's label in the active language, else the raw value made readable. */
function optionLabel(
  options: readonly { value: string; label: string }[],
  value?: string | null,
) {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? formatLabel(value);
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
  const t = useTranslations("profile");
  const intlLocale = useIntlLocale("en-US");
  const badges = computeBadges(userStats, t);
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);
  const startRestore = useStartGithubRestore();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const access = membershipAccess(user);
  const heldBadges = access.state === "held" ? access.badges : [];
  // Whenever the Borderless access is not active, even with no badge.
  const needsConfirm = !!user.borderless && user.borderless.status !== "active";
  const currencySymbol = getCurrencySymbol(user.salary_currency);
  const periodLabel =
    SelectOptions.SALARY_PERIOD.find(
      (o) => o.value === user.salary_period,
    )?.label?.toLowerCase() ?? "";

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
      {/* Header card */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="h-24 bg-linear-to-br from-primary/20 via-primary/10 to-transparent" />
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
              {t("edit")}
            </Button>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="min-w-0 text-lg font-semibold break-words text-foreground outline-none"
              >
                {user.first_name || user.last_name
                  ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
                  : user.username}
              </h1>
              {heldBadges.map((badge) => (
                <MembershipBadge key={badge} badge={badge} size="lg" />
              ))}
              {user.availability && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${AVAILABILITY_STYLES[user.availability] ?? AVAILABILITY_STYLES.not_looking}`}
                >
                  {optionLabel(SelectOptions.AVAILABILITY, user.availability)}
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
                    {t("at")}{" "}
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

      {needsConfirm ? (
        <ConfirmMembershipNotice
          user={user}
          onConfirmed={() => {
            // The confirmed card unmounts its focused button: land on the h1.
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (!active || active === document.body) {
                headingRef.current?.focus();
              }
            });
          }}
        />
      ) : null}

      {/* Info grid */}
      <div className="rounded-xl bg-card p-6 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          {t("details")}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {user.current_company && (
            <InfoItem
              icon={Building}
              label={t("company")}
              value={user.current_company}
            />
          )}
          {user.current_salary != null && (
            <InfoItem
              icon={Briefcase}
              label={t("salary")}
              value={`${currencySymbol}${user.current_salary.toLocaleString(intlLocale)}${periodLabel ? ` / ${periodLabel}` : ""}`}
              tabular
            />
          )}
          {user.seniority_level && (
            <InfoItem
              icon={Award}
              label={t("seniority")}
              value={optionLabel(SelectOptions.SENIORITY, user.seniority_level)}
              capitalize
            />
          )}
          {user.experience_years != null && (
            <InfoItem
              icon={Calendar}
              label={t("experience")}
              value={t("experienceYears", { count: user.experience_years })}
              tabular
            />
          )}
          {user.location && (
            <InfoItem
              icon={MapPin}
              label={t("location")}
              value={user.location}
            />
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
                  {t("linkedinProfile")}
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
              {t("techStack")}
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
      <div className="@container/badges rounded-xl bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {t("badgesTitle")}
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("badgesEarned", {
              earned: earnedBadges.length,
              total: badges.length,
            })}
          </span>
        </div>
        {earnedBadges.length > 0 && (
          <div className="mb-4 grid grid-cols-1 gap-3 @sm/badges:grid-cols-2 @xl/badges:grid-cols-3">
            {earnedBadges.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-accent/50 p-3 transition-shadow hover:shadow-elevated"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${b.color} 14%, transparent)`,
                  }}
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
          <div className="grid grid-cols-1 gap-3 @sm/badges:grid-cols-2 @xl/badges:grid-cols-3">
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

      {/* Restore an old GitHub-era account: only with no GitHub identity on record */}
      {user.github_restore?.available ? (
        <GithubRestoreCard
          onRestore={() => startRestore.mutate()}
          pending={startRestore.isPending || startRestore.isSuccess}
        />
      ) : null}

      {/* Delete Account */}
      <DeleteAccountCard username={user.username} />
    </div>
  );
}

function DeleteAccountCard({ username }: { username: string }) {
  const [confirmValue, setConfirmValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const deleteAccount = useDeleteAccount();
  const t = useTranslations("profile.deleteAccount");

  const confirmText = t("phrase", { username });
  const isConfirmed = confirmValue === confirmText;

  return (
    <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-card">
      <div className="border-b border-destructive/20 bg-destructive/5 px-6 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">
            {t("title")}
          </h2>
        </div>
      </div>

      <div className="px-6 py-5">
        {!expanded ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{t("intro")}</p>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setExpanded(true)}
            >
              {t("open")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {t("warning")}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>{t("itemApplications")}</li>
                <li>{t("itemReports")}</li>
                <li>{t("itemProfile")}</li>
                <li>{t("itemCompanies")}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="delete-confirm"
                className="text-sm text-muted-foreground"
              >
                {t.rich("confirmLabel", {
                  phrase: confirmText,
                  b: (chunks) => (
                    <span className="font-semibold text-foreground">
                      {chunks}
                    </span>
                  ),
                })}
              </label>
              <Input
                id="delete-confirm"
                value={confirmValue}
                onChange={(e) => setConfirmValue(e.target.value)}
                placeholder={confirmText}
                className="border-destructive/30 focus-visible:ring-destructive"
                autoComplete="off"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExpanded(false);
                  setConfirmValue("");
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!isConfirmed || deleteAccount.isPending}
                onClick={() => deleteAccount.mutate()}
              >
                {deleteAccount.isPending ? t("deleting") : t("confirm")}
              </Button>
            </div>
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

type BadgeId =
  | "first_app"
  | "ten_apps"
  | "fifty_apps"
  | "hundred_apps"
  | "first_offer"
  | "high_rate";

function computeBadges(
  stats:
    | {
        total_applications: number;
        success_rate: number;
        offers: number;
        denials: number;
      }
    | undefined,
  tr: ReturnType<typeof useTranslations<"profile">>,
): BadgeDef[] {
  const words = (id: BadgeId) => ({
    id,
    label: tr(`badge.${id}`),
    description: tr(`badgeDescription.${id}`),
  });
  const t = stats?.total_applications ?? 0;
  const o = stats?.offers ?? 0;
  const sr = stats?.success_rate ?? 0;

  // Volume badges ramp along the identity blue as the count grows; the two
  // outcome badges take the chart scale's green and amber.
  return [
    {
      ...words("first_app"),
      icon: Star,
      earned: t >= 1,
      color: "color-mix(in oklab, var(--chart-1) 45%, var(--chart-5))",
    },
    {
      ...words("ten_apps"),
      icon: Flame,
      earned: t >= 10,
      color: "color-mix(in oklab, var(--chart-1) 65%, var(--chart-5))",
    },
    {
      ...words("fifty_apps"),
      icon: Target,
      earned: t >= 50,
      color: "color-mix(in oklab, var(--chart-1) 85%, var(--chart-5))",
    },
    {
      ...words("hundred_apps"),
      icon: Award,
      earned: t >= 100,
      color: "var(--chart-1)",
    },
    {
      ...words("first_offer"),
      icon: Trophy,
      earned: o >= 1,
      color: "var(--chart-2)",
    },
    {
      ...words("high_rate"),
      icon: Zap,
      earned: sr >= 20 && t >= 5,
      color: "var(--chart-3)",
    },
  ];
}
