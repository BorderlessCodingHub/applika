"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { services } from "@/container/services";
import {
  AvailabilityType,
  AvailabilityValues,
  SalaryCurrencyType,
  SalaryCurrencyValues,
  SalaryPeriodType,
  SalaryPeriodValues,
  SeniorityLevelType,
  SeniorityLevelValues,
  type UpdateUserPayload,
} from "@/services/types/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building,
  Calendar,
  Code,
  MapPin,
  Briefcase,
  Pencil,
  X,
  Loader2,
  Linkedin,
  Trophy,
  Target,
  Flame,
  Star,
  Award,
  Zap,
  Eye,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SelectOptions } from "@/options";

function getCurrencySymbol(c?: string) {
  return SelectOptions.CURRENCY.find((o) => o.value === c)?.symbol ?? "$";
}

function formatLabel(v?: string) {
  return v?.replace(/_/g, " ") ?? "";
}

// ── Badges ─────────────────────────────────────────────────

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

// ── Schema ─────────────────────────────────────────────────

const schema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  current_role: z.string().optional(),
  current_company: z.string().optional(),
  current_salary: z.coerce.number().optional(),
  salary_currency: z.enum(SalaryCurrencyValues).optional(),
  salary_period: z.enum(SalaryPeriodValues).optional(),
  experience_years: z.coerce.number().optional(),
  seniority_level: z.enum(SeniorityLevelValues).optional(),
  location: z.string().optional(),
  availability: z.enum(AvailabilityValues).optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  tech_stack_raw: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

// ── Availability colors ────────────────────────────────────

const AVAILABILITY_STYLES: Record<string, string> = {
  open_to_work: "bg-success/15 text-success border-success/30",
  casually_looking: "bg-warning/15 text-warning border-warning/30",
  not_looking: "bg-muted text-muted-foreground border-border",
};

// ── Component ──────────────────────────────────────────────

export function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const stats = useQuery({
    queryKey: ["statistics", "general"],
    queryFn: () => services.statistics.getGeneralStats(),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const watchSalaryCurrency = useWatch({
    control: form.control,
    name: "salary_currency",
  });
  const watchSalaryPeriod = useWatch({
    control: form.control,
    name: "salary_period",
  });
  const watchSeniorityLevel = useWatch({
    control: form.control,
    name: "seniority_level",
  });
  const watchAvailability = useWatch({
    control: form.control,
    name: "availability",
  });

  const mutation = useMutation({
    mutationFn: (data: UpdateUserPayload) => services.users.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
      toast.success("Profile updated");
      setEditing(false);
    },
    onError: () => toast.error("Failed to update profile"),
  });

  if (!user) return null;

  const avatarUrl = `https://avatars.githubusercontent.com/u/${user.github_id}?v=4`;
  const avatarFallback =
    user.first_name && user.last_name
      ? user.first_name[0] + user.last_name[0]
      : user.username.substring(0, 2);

  const badges = computeBadges(stats.data);
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);
  const currencySymbol = getCurrencySymbol(user.salary_currency);
  const periodLabel =
    SelectOptions.SALARY_PERIOD.find(
      (o) => o.value === user.salary_period
    )?.label?.toLowerCase() ?? "";

  const startEditing = () => {
    form.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      current_role: user.current_role,
      current_company: user.current_company,
      current_salary: user.current_salary,
      salary_currency: user.salary_currency,
      salary_period: user.salary_period,
      experience_years: user.experience_years,
      seniority_level: user.seniority_level,
      location: user.location,
      availability: user.availability,
      bio: user.bio,
      linkedin_url: user.linkedin_url,
      tech_stack_raw: user.tech_stack?.join(", "),
    });
    setEditing(true);
  };

  const onSubmit = (data: FormData) => {
    const techStack = data.tech_stack_raw
      ? data.tech_stack_raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    mutation.mutate({
      first_name: data.first_name,
      last_name: data.last_name,
      current_role: data.current_role,
      current_company: data.current_company,
      current_salary: data.current_salary,
      salary_currency: data.salary_currency,
      salary_period: data.salary_period,
      experience_years: data.experience_years,
      seniority_level: data.seniority_level,
      location: data.location,
      availability: data.availability,
      bio: data.bio,
      linkedin_url: data.linkedin_url,
      tech_stack: techStack,
    });
  };

  // ── Read-only view ─────────────────────────────────────

  if (!editing) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
        {/* Header card */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card">
          <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
          <div className="-mt-12 px-6 pb-6">
            <div className="flex items-end justify-between">
              <Avatar className="shadow-elevated h-20 w-20 ring-4 ring-card">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="capitalize">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="outline"
                size="sm"
                className="mb-1 gap-1.5"
                onClick={startEditing}
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
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Details
          </h2>
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
                <Linkedin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <span className="text-xs text-muted-foreground">
                    LinkedIn
                  </span>
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
                    <b.icon
                      className="h-4.5 w-4.5"
                      style={{ color: b.color }}
                    />
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

  // ── Edit view ──────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="h-16 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="-mt-8 space-y-5 px-6 pb-6"
        >
          <div className="flex items-end justify-between">
            <Avatar className="shadow-elevated h-20 w-20 ring-4 ring-card">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="capitalize">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div className="mb-1 flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending}
                className="gap-1.5"
              >
                {mutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...form.register("first_name")} placeholder="John" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...form.register("last_name")} placeholder="Doe" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea
              {...form.register("bio")}
              placeholder="A short intro about yourself…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Current Role</Label>
              <Input
                {...form.register("current_role")}
                placeholder="e.g. Frontend Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input
                {...form.register("current_company")}
                placeholder="e.g. Acme Inc."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Salary</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  {getCurrencySymbol(watchSalaryCurrency)}
                </span>
                <Input
                  type="number"
                  {...form.register("current_salary")}
                  className="pl-8"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select
                value={watchSalaryCurrency}
                onValueChange={(v) =>
                  form.setValue("salary_currency", v as SalaryCurrencyType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SelectOptions.CURRENCY.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.symbol} — {c.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select
                value={watchSalaryPeriod}
                onValueChange={(v) =>
                  form.setValue("salary_period", v as SalaryPeriodType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SelectOptions.SALARY_PERIOD.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Seniority Level</Label>
              <Select
                value={watchSeniorityLevel}
                onValueChange={(v) =>
                  form.setValue("seniority_level", v as SeniorityLevelType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {SelectOptions.SENIORITY.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Experience (years)</Label>
              <Input
                type="number"
                {...form.register("experience_years")}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                {...form.register("location")}
                placeholder="e.g. São Paulo, Brazil"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Availability</Label>
              <Select
                value={watchAvailability}
                onValueChange={(v) =>
                  form.setValue("availability", v as AvailabilityType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {SelectOptions.AVAILABILITY.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>LinkedIn URL</Label>
            <Input
              {...form.register("linkedin_url")}
              placeholder="https://linkedin.com/in/…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tech Stack</Label>
            <Input
              {...form.register("tech_stack_raw")}
              placeholder="React, TypeScript, Node.js, …"
            />
            <p className="text-[11px] text-muted-foreground">Comma-separated</p>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function InfoItem({
  icon: Icon,
  label,
  value,
  tabular,
  capitalize,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tabular?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <p
          className={`text-sm text-foreground ${tabular ? "tabular-nums" : ""} ${capitalize ? "capitalize" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
