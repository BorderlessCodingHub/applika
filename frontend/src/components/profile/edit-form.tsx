"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AvailabilityType,
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
  User,
} from "@/services/types/users";
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
import { X, Loader2 } from "lucide-react";
import { SelectOptions } from "@/options";
import { UserProfileAvatar } from "@/components/profile/sub-components";
import {
  getCurrencySymbol,
  UserProfileFormData,
  UserProfileSchema,
  buildDefaultValues,
} from "@/components/profile/edit-form-config";
import { useMutateUserProfile } from "@/hooks/use-user";

interface UserProfileEditFormProps {
  user: User;
  onSave: () => void;
  onCancel: () => void;
}

export function UserProfileEditForm({
  user,
  onSave,
  onCancel,
}: UserProfileEditFormProps) {
  const mutation = useMutateUserProfile();

  const defaultFormValues = buildDefaultValues(user);
  const form = useForm<UserProfileFormData>({
    resolver: zodResolver(UserProfileSchema),
    defaultValues: defaultFormValues,
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

  function handleCancelClick() {
    form.reset(defaultFormValues);
    onCancel();
  }

  async function handleSubmitClick(data: UserProfileFormData) {
    const techStack = data.tech_stack_raw
      ? data.tech_stack_raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    await mutation.submit({
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
    onSave();
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="h-16 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <form
          onSubmit={form.handleSubmit(handleSubmitClick)}
          className="-mt-8 space-y-5 px-6 pb-6"
        >
          <div className="flex items-end justify-between">
            <UserProfileAvatar user={user} />
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
                onClick={handleCancelClick}
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
                  {...form.register("current_salary", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
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
                {...form.register("experience_years", {
                  setValueAs: (v) => (v === "" ? undefined : Number(v)),
                })}
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
