"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { z } from "zod";

import {
  emptyTailoredCvValues,
  tailoredCvSchema,
  tailoredCvToFormValues,
  toTailoredCvPayload,
} from "@/components/tailored-cvs/tailored-cv-schema";
import type { CvFormValues } from "@/components/base-cvs/types";
import type { TailoredCv } from "@/components/tailored-cvs/types";
import {
  DRAFT_REQUIREMENT_ORDER,
  NEW_WITH_CV_HREF,
  isNotFutureCalendarDay,
  localCalendarDay,
  safeErrorMessage,
  type DraftRequirement,
  type DraftStep,
} from "@/components/application-drafts/draft-copy";
import { AutosaveStatus } from "@/components/application-drafts/autosave-status";
import { DraftStepper } from "@/components/application-drafts/draft-stepper";
import { DraftFooterActions } from "@/components/application-drafts/draft-footer-actions";
import {
  DraftLoadMessage,
  DraftLoading,
  DraftPageHeader,
} from "@/components/application-drafts/draft-page-states";
import { DraftApplicationStep } from "@/components/application-drafts/draft-application-step";
import { DraftCvStep } from "@/components/application-drafts/draft-cv-step";
import { CvFitPanel } from "@/components/tailored-cvs/cv-fit-panel";
import type { ApplicationFieldsValues } from "@/components/applications/application-fields";
import { ZodType } from "@/components/applications/company-select";
import type { Company } from "@/services/types/applications";
import {
  ModeValues,
  WorkModeValues,
  type ModeType,
} from "@/services/types/applications";
import {
  SalaryCurrencyValues,
  SalaryPeriodValues,
  SeniorityLevelValues,
} from "@/services/types/users";
import { CvEditorFooter } from "@/components/base-cvs/cv-editor-footer";
import { useCompanySearch } from "@/hooks/use-companies";
import { usePlatforms } from "@/hooks/use-platforms";
import { useCreatePlatformOutcome } from "@/hooks/use-create-platform";
import {
  useCreateDraft,
  useDraft,
  useFinishDraft,
  useUpdateDraft,
} from "@/hooks/use-application-drafts";
import { useCreateTailoredCv } from "@/hooks/use-create-tailored-cv";
import { useDeleteTailoredCv } from "@/hooks/use-delete-tailored-cv";
import { isNoTailoredCv, useTailoredCv } from "@/hooks/use-tailored-cv";
import { TAILORED_CVS_QUERY_KEY } from "@/hooks/use-tailored-cv";
import {
  APPLICATION_CV_FIT_QUERY_KEY,
  useApplicationCvFit,
} from "@/hooks/use-application-cv-fit";
import { BetaBadge } from "@/components/features/beta-badge";
import { FeatureGate } from "@/components/features/feature-gate";
import { useHasFeature } from "@/hooks/use-features";
import { useDebouncedAutosave } from "@/hooks/use-debounced-autosave";
import { formatNumber } from "@/i18n/format-number";
import { getTranslatorLocale, word } from "@/i18n/translator";
import { services } from "@/services/services";
import type { UpdateTailoredCvPayload } from "@/services/types/tailored-cv";
import type { DraftInput } from "@/services/types/application-drafts";

/** Server ceiling on `job_description`, mirrored from `application-fields.tsx`. */
const JOB_DESCRIPTION_MAX = 50_000;

/**
 * A validation message read at validation time, so it is written in the
 * active language (the side sheet's `applications.validation.*` words).
 */
function message(key: string) {
  return { error: () => word(`applications.validation.${key}`) };
}

/** `Keep this under {max} characters`; "50000" in English, "50.000" in Portuguese. */
function tooLongWords(max: number): string {
  return word("drafts.validation.tooLong", {
    max: formatNumber(max, getTranslatorLocale()),
  });
}

/**
 * The same rules the side sheet's schema enforces (KODI-033 QA round 1, B1),
 * plus `application_date` (KODI-036, AC1/AC3): step 1 now asks for it too, and
 * it is validated here the same way — required and never later than the
 * user's own today. Applying this schema is what stops an invalid job link,
 * an out-of-range job description or a future date from ever reaching a
 * `PUT`, and what puts an inline error on screen instead of a silent
 * "Not saved" with no reason.
 */
const draftApplicationSchema = z
  .object({
    company: ZodType.ZodSchema,
    platform_id: z.string().min(1, message("platformRequired")),
    role: z
      .string()
      .min(1, message("roleRequired"))
      .max(200, { error: () => tooLongWords(200) }),
    mode: z.enum(ModeValues, message("sourceRequired")),
    // See `isNotFutureCalendarDay` (frontend-qa KODI-036 round 1, B1): a
    // `Date`-object comparison here used to refuse a user's own TODAY once
    // their local calendar day was ahead of UTC's.
    application_date: z
      .string()
      .min(1, message("dateRequired"))
      .refine((v) => isNotFutureCalendarDay(v), message("dateInFuture")),
    link_to_job: z.union([z.literal(""), z.httpUrl(message("invalidUrl"))]),
    currency: z.enum(SalaryCurrencyValues).optional(),
    salary_period: z.enum(SalaryPeriodValues).optional(),
    expected_salary: z.nan().or(z.number()),
    salary_range_min: z.nan().or(z.number()),
    salary_range_max: z.nan().or(z.number()),
    experience_level: z.enum(SeniorityLevelValues).optional(),
    work_mode: z.enum(WorkModeValues).optional(),
    country: z.string().optional(),
    observation: z.string().optional(),
    job_description: z
      .string()
      .max(JOB_DESCRIPTION_MAX, {
        error: () => tooLongWords(JOB_DESCRIPTION_MAX),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.company &&
      typeof data.company === "object" &&
      (data.company.name ?? "").trim().length > 200
    ) {
      ctx.addIssue({
        code: "custom",
        message: tooLongWords(200),
        path: ["company", "name"],
      });
    }
    const hasSalary =
      (data.expected_salary && data.expected_salary !== 0) ||
      (data.salary_range_min && data.salary_range_min !== 0) ||
      (data.salary_range_max && data.salary_range_max !== 0);
    if (hasSalary) {
      if (!data.currency) {
        ctx.addIssue({
          code: "custom",
          message: word("applications.validation.requiredWithSalary"),
          path: ["currency"],
        });
      }
      if (!data.salary_period) {
        ctx.addIssue({
          code: "custom",
          message: word("applications.validation.requiredWithSalary"),
          path: ["salary_period"],
        });
      }
    }
  });

type DraftFormData = z.infer<typeof draftApplicationSchema>;

function defaultApplicationValues(): DraftFormData {
  return {
    company: undefined,
    role: "",
    platform_id: "",
    mode: "active",
    application_date: localCalendarDay(),
    link_to_job: "",
    currency: undefined,
    salary_period: undefined,
    expected_salary: Number.NaN,
    salary_range_min: Number.NaN,
    salary_range_max: Number.NaN,
    experience_level: undefined,
    work_mode: undefined,
    country: undefined,
    observation: undefined,
    job_description: undefined,
  };
}

function applicationValuesFromDraft(draft: DraftInput): DraftFormData {
  return {
    company: draft.company_id
      ? draft.company_id
      : draft.company_name
        ? { name: draft.company_name, url: "" }
        : undefined,
    role: draft.role ?? "",
    platform_id: draft.platform_id ?? "",
    mode: draft.mode ?? "active",
    application_date: draft.application_date ?? localCalendarDay(),
    link_to_job: draft.link_to_job ?? "",
    currency: draft.currency ?? undefined,
    salary_period: draft.salary_period ?? undefined,
    expected_salary: draft.expected_salary ?? Number.NaN,
    salary_range_min: draft.salary_range_min ?? Number.NaN,
    salary_range_max: draft.salary_range_max ?? Number.NaN,
    experience_level: draft.experience_level ?? undefined,
    work_mode: draft.work_mode ?? undefined,
    country: draft.country ?? undefined,
    observation: draft.observation ?? undefined,
    job_description: draft.job_description ?? undefined,
  };
}

interface CompanyMeta {
  id: string;
  name: string;
}

/** Every field `DraftInput` carries, compared value by value — never by
 * re-serializing (key order differs between what the server returns and what
 * this page builds) and never by identity. Used to skip a `PUT` that would
 * send back exactly what was just loaded (KODI-033 QA round 1, B2/P3). */
function draftInputsEqual(a: DraftInput, b: DraftInput): boolean {
  return (
    a.company_id === b.company_id &&
    a.company_name === b.company_name &&
    a.role === b.role &&
    a.platform_id === b.platform_id &&
    a.mode === b.mode &&
    (a.application_date ?? null) === (b.application_date ?? null) &&
    (a.link_to_job ?? null) === (b.link_to_job ?? null) &&
    (a.observation ?? null) === (b.observation ?? null) &&
    (a.expected_salary ?? null) === (b.expected_salary ?? null) &&
    (a.salary_range_min ?? null) === (b.salary_range_min ?? null) &&
    (a.salary_range_max ?? null) === (b.salary_range_max ?? null) &&
    (a.currency ?? null) === (b.currency ?? null) &&
    (a.salary_period ?? null) === (b.salary_period ?? null) &&
    (a.experience_level ?? null) === (b.experience_level ?? null) &&
    (a.work_mode ?? null) === (b.work_mode ?? null) &&
    (a.country ?? null) === (b.country ?? null) &&
    (a.job_description ?? null) === (b.job_description ?? null)
  );
}

/**
 * `/applications/new-with-cv` (PRD 0010, KODI-033): create an application and
 * its CV copy together, in two steps, as a draft that autosaves. This
 * component owns BOTH react-hook-form instances, BOTH autosave loops, the CV
 * copy's query and mutations, company resolution and the beforeunload guard.
 *
 * Everything the draft needs to survive a step switch lives HERE, never in
 * `DraftCvStep` (KODI-033 QA round 1, B2/B3): that component switches in and
 * out of the DOM on every step change, so anything it held as local state or
 * a ref would reset on remount and either autosave an empty CV over a real
 * copy or revert an unsaved edit the instant the user came back to step 2.
 *
 * Behind the `cvs` feature: without it, the app's "page not found" and no
 * draft or CV request. The inner `jobs` checks stay.
 */
export function NewWithCvPage() {
  return (
    <FeatureGate feature="cvs">
      <NewWithCv />
    </FeatureGate>
  );
}

/** The route's Suspense fallback while `useSearchParams` resolves. */
export function NewWithCvPageFallback() {
  const t = useTranslations("drafts.page");
  return (
    <div
      aria-busy
      aria-label={t("pageLoading")}
      className="h-64 w-full animate-pulse rounded-xl bg-muted"
    />
  );
}

function NewWithCv() {
  // Subscribes the page to the language: the load error below is computed
  // through the module translator (`safeErrorMessage`) during render.
  useTranslations("drafts");
  // Computed once for all four headers, so the badge never blinks between states.
  const titleBadge =
    useHasFeature("cvs").stage === "beta" ? <BetaBadge /> : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const stepParam = searchParams.get("step");

  // The draft id is either the URL's `?id=` or one this component itself just
  // created (before `router.replace` catches the URL up) — a derived value,
  // never a copy kept in its own effect-synced state.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const draftId = idParam ?? createdId;

  const [step, setStep] = useState<DraftStep>(
    stepParam === "cv" ? "cv" : "application",
  );
  const [hasCv, setHasCv] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [companyMeta, setCompanyMeta] = useState<CompanyMeta | null>(null);
  // The draft id / CV copy id this component has already seeded the forms
  // from — a plain render-time comparison (React's own "adjust state when a
  // prop changes" pattern), not an effect: a synchronous `setState` inside a
  // `useEffect` body is a lint error here (`react-hooks/set-state-in-effect`).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [seededCvFor, setSeededCvFor] = useState<string | null>(null);
  // Seeded ONCE per draft, from its own record — never from live typing, the
  // same "snapshot at load" the side sheet's own `buildCompanySelectDefaultValue`
  // takes (QA round 2, D3: a `useMemo` keyed on `draft` recomputed on every
  // save and stomped a half-typed Company URL mid-edit).
  const [companySelectValue, setCompanySelectValue] = useState<Company | null>(
    null,
  );

  // The last DraftInput/CV payload known to match the server, so a `PUT` is
  // sent only when something actually changed since load (KODI-033 QA round
  // 1, B2/P3) — state, not a ref: both are also SET from the render-phase
  // seeding block below, and writing a ref during render is a lint error here.
  const [lastSavedDraftInput, setLastSavedDraftInput] =
    useState<DraftInput | null>(null);
  const [lastSavedCvPayload, setLastSavedCvPayload] = useState<string | null>(
    null,
  );

  // Mirrors `draftId` for the async autosave loop (`saveApplication` below).
  // `draftId` itself is a derived value (`idParam ?? createdId`), so a normal
  // render always sees it correctly — but `useDebouncedAutosave`'s internal
  // loop can call `saveApplication` a SECOND time, synchronously in the same
  // microtask right after the first `POST` resolves and BEFORE React commits
  // the `setCreatedId` that would otherwise flip `draftId` (KODI-033 QA round
  // 1, B2): that second call would still see the OLD closure's `draftId ===
  // null` and `POST` a second draft. Writing this ref synchronously, inside
  // `saveApplication` itself, the moment the first `POST` resolves, is what
  // the second call actually reads — a ref survives a stale closure because
  // its IDENTITY (not its value) is what got captured.
  const draftIdRef = useRef<string | null>(null);
  useEffect(() => {
    draftIdRef.current = draftId;
  });

  const draftQuery = useDraft(draftId);
  const draft = draftQuery.data;
  const draftNotFound =
    isAxiosError(draftQuery.error) && draftQuery.error.response?.status === 404;

  const { data: platforms, isLoading: platformsLoading } = usePlatforms();
  const { fetchCompanies } = useCompanySearch();
  const createPlatformOutcome = useCreatePlatformOutcome();

  const createDraft = useCreateDraft();
  const updateDraft = useUpdateDraft();
  const finishDraft = useFinishDraft();

  // The CV copy's own query and mutations live HERE (not in `DraftCvStep`):
  // see the file-level note on B2/B3.
  const {
    data: cvData,
    isLoading: cvLoading,
    error: cvError,
  } = useTailoredCv(draftId);
  // QA round 2, D2: TanStack Query keeps the last-known `data` around across a
  // refetch that answers 404 (e.g. right after a delete), so reading `cvData`
  // directly could load the just-deleted copy back into the editor. A 404 here
  // always means "no copy", whatever `data` still holds.
  const cv = isNoTailoredCv(cvError) ? undefined : cvData;
  const createTailoredCv = useCreateTailoredCv(draftId ?? "", {
    onSuccess: (created: TailoredCv) => {
      // QA round 2, D1: without this the form stayed at its empty defaults —
      // `seededCvFor` was already set to `created.id`, so the normal
      // render-phase seeding block below saw no id CHANGE and never reset it.
      const values = tailoredCvToFormValues(created);
      setSeededCvFor(created.id);
      cvForm.reset(values);
      setLastSavedCvPayload(JSON.stringify(toTailoredCvPayload(values)));
      setHasCv(true);
    },
  });
  const deleteTailoredCv = useDeleteTailoredCv(draftId ?? "", {
    onSuccess: () => {
      setSeededCvFor(null);
      setLastSavedCvPayload(null);
      cvForm.reset(emptyTailoredCvValues());
      setHasCv(false);
    },
  });
  // A SILENT update for autosave — the toasting `useUpdateTailoredCv` would
  // pop a "CV copy saved" toast about once a second while the user types
  // (KODI-033 QA round 1, should-fix P6).
  //
  // `networkMode: "always"` (KODI-034, owner-ordered 2026-09-26): same
  // offline-autosave fix as `useCreateDraft`/`useUpdateDraft`
  // (`use-application-drafts.ts`) — R-008 covers both the application data
  // and the CV copy, so this step-2 autosave mutation gets the same option
  // rather than flipping the shared `QueryClient`'s default (`query-client.ts`
  // keeps `retry: false` for QUERIES only): a per-mutation option is narrower
  // and cannot change how any query behaves offline.
  const updateTailoredCvSilently = useMutation({
    mutationFn: (data: UpdateTailoredCvPayload) =>
      services.tailoredCvs.update(draftId as string, data),
    networkMode: "always",
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TAILORED_CVS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: APPLICATION_CV_FIT_QUERY_KEY,
      });
    },
  });

  const applicationForm = useForm<DraftFormData>({
    resolver: zodResolver(draftApplicationSchema),
    defaultValues: defaultApplicationValues(),
    mode: "onChange",
  });
  const cvForm = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: emptyTailoredCvValues(),
    mode: "onChange",
  });

  // Seed the application form, the company display and the step exactly once
  // per draft id (AC12).
  if (draft && seededFor !== draft.id) {
    setSeededFor(draft.id);
    applicationForm.reset(applicationValuesFromDraft(draft));
    if (draft.company_id) {
      setCompanyMeta({ id: draft.company_id, name: draft.company_name });
    }
    setLastSavedDraftInput(draft);
    setCompanySelectValue(
      draft.company_id
        ? { id: draft.company_id, name: draft.company_name, url: "" }
        : draft.company_name
          ? { id: "", name: draft.company_name, url: "" }
          : null,
    );
    setHasCv(draft.has_cv);
    if (stepParam !== "application" && stepParam !== "cv") {
      setStep(draft.has_cv ? "cv" : "application");
    }
  }

  // Seed the CV form exactly once per copy id — never re-seeded on a later
  // refetch, and never lost by switching steps away and back (B2/B3).
  if (cv && seededCvFor !== cv.id) {
    setSeededCvFor(cv.id);
    cvForm.reset(tailoredCvToFormValues(cv));
    setLastSavedCvPayload(
      JSON.stringify(toTailoredCvPayload(tailoredCvToFormValues(cv))),
    );
    if (!hasCv) setHasCv(true);
  }

  const watchedApplication = useWatch({ control: applicationForm.control });
  const companyValue = watchedApplication.company;
  const companyPresent =
    typeof companyValue === "string"
      ? companyValue.trim().length > 0
      : Boolean(companyValue?.name?.trim());
  const applicationReady = Boolean(
    companyPresent &&
    watchedApplication.role?.trim() &&
    watchedApplication.platform_id,
  );

  // The picker itself resolves a URL-having company to a real id at confirm
  // time (KODI-035, T111) — there is no URL-blur/confirm step left here.
  const resolveCompany = useCallback(async (): Promise<{
    company_id: string | null;
    company_name: string;
  } | null> => {
    const raw = applicationForm.getValues("company");
    if (typeof raw === "string" && raw.trim()) {
      const name = companyMeta?.id === raw ? companyMeta.name : "";
      return { company_id: raw, company_name: name };
    }
    if (raw && typeof raw === "object") {
      const name = (raw.name ?? "").trim();
      if (!name) return null;
      return { company_id: null, company_name: name };
    }
    return null;
  }, [applicationForm, companyMeta]);

  const buildDraftInput = useCallback(async (): Promise<DraftInput | null> => {
    const resolved = await resolveCompany();
    if (!resolved) return null;
    const values = applicationForm.getValues();
    const includeSalary = Boolean(values.currency && values.salary_period);
    return {
      company_id: resolved.company_id,
      company_name: resolved.company_name,
      role: (values.role ?? "").trim(),
      platform_id: values.platform_id,
      mode: values.mode as ModeType,
      application_date: values.application_date,
      link_to_job: values.link_to_job || undefined,
      observation: values.observation || undefined,
      expected_salary:
        includeSalary && !Number.isNaN(values.expected_salary)
          ? values.expected_salary
          : undefined,
      salary_range_min:
        includeSalary && !Number.isNaN(values.salary_range_min)
          ? values.salary_range_min
          : undefined,
      salary_range_max:
        includeSalary && !Number.isNaN(values.salary_range_max)
          ? values.salary_range_max
          : undefined,
      currency: includeSalary ? values.currency : undefined,
      salary_period: includeSalary ? values.salary_period : undefined,
      experience_level: values.experience_level,
      work_mode: values.work_mode,
      country: values.country || undefined,
      job_description: values.job_description?.trim()
        ? values.job_description
        : null,
    };
  }, [applicationForm, resolveCompany]);

  const saveApplication = useCallback(async () => {
    const valid = await applicationForm.trigger();
    if (!valid) throw new Error("validation");
    const input = await buildDraftInput();
    if (!input) return;
    if (lastSavedDraftInput && draftInputsEqual(lastSavedDraftInput, input)) {
      return;
    }
    if (!draftIdRef.current) {
      const created = await createDraft.mutateAsync(input);
      // Set synchronously, BEFORE any state update — see the note on
      // `draftIdRef` above (KODI-033 QA round 1, B2).
      draftIdRef.current = created.id;
      setCreatedId(created.id);
      setSeededFor(created.id);
      setLastSavedDraftInput(created);
      if (created.company_id) {
        setCompanyMeta({ id: created.company_id, name: created.company_name });
      }
      const qs = new URLSearchParams();
      qs.set("id", created.id);
      router.replace(`${NEW_WITH_CV_HREF}?${qs.toString()}`);
    } else {
      const saved = await updateDraft.mutateAsync({
        id: draftIdRef.current,
        data: input,
      });
      setLastSavedDraftInput(saved);
    }
  }, [
    applicationForm,
    buildDraftInput,
    createDraft,
    updateDraft,
    router,
    lastSavedDraftInput,
  ]);

  const applicationAutosaveValue = useMemo(
    () => ({ values: watchedApplication }),
    [watchedApplication],
  );
  const applicationAutosave = useDebouncedAutosave({
    value: applicationAutosaveValue,
    isReady: applicationReady,
    onSave: saveApplication,
  });

  const watchedCv = useWatch({ control: cvForm.control });
  const cvAutosave = useDebouncedAutosave({
    value: watchedCv,
    isReady: hasCv,
    onSave: async () => {
      if (!draftId) return;
      const payload = toTailoredCvPayload(cvForm.getValues());
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedCvPayload) return;
      const valid = await cvForm.trigger();
      if (!valid) throw new Error("validation");
      await updateTailoredCvSilently.mutateAsync(payload);
      setLastSavedCvPayload(serialized);
    },
  });

  // R-026/R-028 key off the SAVED job description: the server tailors and
  // scores against what it has, not what is still being typed.
  const savedHasJobDescription = Boolean(
    lastSavedDraftInput?.job_description?.trim(),
  );
  // PRD 0013: "Tailor by keywords" and the fit are job-board tools, shown
  // only with `jobs`; the draft itself and its copy work the same without.
  const hasJobs = useHasFeature("jobs").has;
  const jobTools = hasJobs && savedHasJobDescription;
  const fitQuery = useApplicationCvFit(draftId, Boolean(cv) && jobTools);
  const fitIsNoCopy = isNoTailoredCv(fitQuery.error);

  // beforeunload while typing is unsaved — before the draft exists, or while
  // an autosave is in flight or failed (AC6/AC7/AC8).
  const unsavedRiskRef = useRef(false);
  const hasUnsavedRisk =
    (!draftId && applicationForm.formState.isDirty) ||
    applicationAutosave.status === "saving" ||
    applicationAutosave.status === "error" ||
    (Boolean(draftId) &&
      (cvAutosave.status === "saving" || cvAutosave.status === "error"));
  useEffect(() => {
    unsavedRiskRef.current = hasUnsavedRisk;
  });
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!unsavedRiskRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleCompanyChange = useCallback((company: Company | null) => {
    setCompanyMeta(
      company && company.id ? { id: company.id, name: company.name } : null,
    );
  }, []);

  // Rebuilds the value handed to `CompanySelect` from the CURRENT form state
  // (never from the server's `draft`, which is what D3 fixed away from) —
  // needed because `DraftApplicationStep` UNMOUNTS on step change and
  // `CompanySelect` re-seeds its own internal selection from this prop the
  // moment it remounts (KODI-033 QA round 1, B1): without this, going to step
  // 2 and back showed whatever `companySelectValue` held at the draft's
  // ORIGINAL load — reverting a company changed since, or wiping a
  // free-text company's typed URL back to `""` — and the next autosave PUT
  // then re-sent the stale value.
  const syncCompanySelectValueFromForm = useCallback((): Company | null => {
    const raw = applicationForm.getValues("company");
    if (typeof raw === "string" && raw.trim()) {
      return {
        id: raw,
        name: companyMeta?.id === raw ? companyMeta.name : "",
        url: "",
      };
    }
    if (raw && typeof raw === "object") {
      const name = (raw.name ?? "").trim();
      if (!name) return null;
      return { id: "", name, url: raw.url ?? "" };
    }
    return null;
  }, [applicationForm, companyMeta]);

  const goToStep = useCallback(
    (next: DraftStep) => {
      if (next === "application") {
        setCompanySelectValue(syncCompanySelectValueFromForm());
      }
      setStep(next);
    },
    [syncCompanySelectValueFromForm],
  );

  const missing = useMemo<DraftRequirement[]>(() => {
    const list: DraftRequirement[] = [];
    if (!companyPresent) list.push("company");
    if (!watchedApplication.role?.trim()) list.push("role");
    if (!watchedApplication.platform_id) list.push("platform");
    if (!hasCv) list.push("cv");
    return DRAFT_REQUIREMENT_ORDER.filter((item) => list.includes(item));
  }, [
    companyPresent,
    watchedApplication.role,
    watchedApplication.platform_id,
    hasCv,
  ]);

  const handleFinish = useCallback(async () => {
    if (!draftId || missing.length > 0) return;
    setFinishError(null);
    try {
      const validApplication = await applicationForm.trigger();
      if (!validApplication) {
        setFinishError(word("drafts.page.applicationNeedsFixing"));
        return;
      }
      // Flush: PUT is a full replace, so sending it once more right before
      // finishing guarantees the server has the latest typed values even if
      // the debounce has not fired yet.
      const input = await buildDraftInput();
      let savedApplicationDate = lastSavedDraftInput?.application_date;
      if (input) {
        const saved = await updateDraft.mutateAsync({
          id: draftId,
          data: input,
        });
        setLastSavedDraftInput(saved);
        savedApplicationDate = saved.application_date;
      }
      if (hasCv) {
        const validCv = await cvForm.trigger();
        if (!validCv) {
          setFinishError(word("drafts.page.cvNeedsFixing"));
          return;
        }
        const payload = toTailoredCvPayload(cvForm.getValues());
        await updateTailoredCvSilently.mutateAsync(payload);
        setLastSavedCvPayload(JSON.stringify(payload));
      }
      await finishDraft.mutateAsync({
        id: draftId,
        applicationDate: savedApplicationDate ?? localCalendarDay(),
      });
      toast.success(word("drafts.page.created"));
      router.push("/applications");
    } catch (error) {
      setFinishError(safeErrorMessage(error, word("drafts.page.finishFailed")));
    }
  }, [
    draftId,
    missing.length,
    applicationForm,
    buildDraftInput,
    updateDraft,
    lastSavedDraftInput,
    hasCv,
    cvForm,
    updateTailoredCvSilently,
    finishDraft,
    router,
  ]);

  const subtitle =
    watchedApplication.role && companyPresent
      ? `${watchedApplication.role} · ${
          typeof companyValue === "string"
            ? (companyMeta?.name ?? "")
            : companyValue?.name
        }`
      : null;

  if (idParam && draftQuery.isLoading) {
    return (
      <div className="space-y-6">
        <DraftPageHeader subtitle={subtitle} titleBadge={titleBadge} />
        <DraftLoading />
      </div>
    );
  }

  if (idParam && draftNotFound) {
    return (
      <div className="space-y-6">
        <DraftPageHeader titleBadge={titleBadge} />
        <DraftLoadMessage kind="not-found" />
      </div>
    );
  }

  if (idParam && draftQuery.isError && !draftNotFound) {
    return (
      <div className="space-y-6">
        <DraftPageHeader titleBadge={titleBadge} />
        <DraftLoadMessage
          kind="error"
          detail={safeErrorMessage(draftQuery.error)}
          onRetry={() => void draftQuery.refetch()}
        />
      </div>
    );
  }

  const activeAutosave =
    step === "application" ? applicationAutosave : cvAutosave;
  const footerActions = (
    <DraftFooterActions
      step={step}
      status={
        <AutosaveStatus
          status={activeAutosave.status}
          missingRequired={
            step === "application" &&
            Boolean(draftId) &&
            applicationAutosave.missingRequired
          }
          onRetry={activeAutosave.retry}
        />
      }
      canContinue={Boolean(draftId)}
      onContinue={() => setStep("cv")}
      onBack={() => goToStep("application")}
      hasUnsavedRisk={hasUnsavedRisk}
      missing={missing}
      onFinish={() => void handleFinish()}
      isFinishing={finishDraft.isPending}
      finishError={finishError}
    />
  );

  const cvLoadErrorMessage =
    cvError && !isNoTailoredCv(cvError) ? safeErrorMessage(cvError) : null;

  return (
    <div className="space-y-6">
      <DraftPageHeader subtitle={subtitle} titleBadge={titleBadge}>
        <DraftStepper
          step={step}
          onStepChange={goToStep}
          canOpenCv={Boolean(draftId)}
          applicationComplete={applicationReady}
          cvComplete={hasCv}
        />
      </DraftPageHeader>

      {step === "application" ? (
        <>
          <DraftApplicationStep
            form={
              applicationForm as unknown as UseFormReturn<ApplicationFieldsValues>
            }
            fetchCompanies={fetchCompanies}
            companySelectValue={companySelectValue}
            onCompanyChange={handleCompanyChange}
            platforms={platforms}
            platformsLoading={platformsLoading}
            onCreatePlatform={createPlatformOutcome}
          />
          <CvEditorFooter>{footerActions}</CvEditorFooter>
        </>
      ) : draftId ? (
        <DraftCvStep
          form={cvForm}
          cv={cv ?? null}
          isLoadingCv={cvLoading}
          cvLoadErrorMessage={cvLoadErrorMessage}
          onCreate={(baseCvId, tailoring) =>
            createTailoredCv.mutate({ baseCvId, tailoring })
          }
          isCreating={createTailoredCv.isPending}
          onDelete={() => deleteTailoredCv.mutate()}
          isDeleting={deleteTailoredCv.isPending}
          footer={hasCv ? footerActions : undefined}
          onAddJobDescription={() => goToStep("application")}
          jobDescription={watchedApplication.job_description}
          canTailorByKeywords={jobTools}
          fit={
            jobTools && cv && !fitIsNoCopy ? (
              <CvFitPanel
                fit={fitQuery.data}
                isLoading={fitQuery.isLoading}
                isError={fitQuery.isError}
                onRetry={() => void fitQuery.refetch()}
                isRetrying={fitQuery.isFetching}
                dirty={
                  cvAutosave.status === "saving" ||
                  cvAutosave.status === "error"
                }
              />
            ) : undefined
          }
        />
      ) : null}
      {step === "cv" && draftId && !hasCv ? (
        <CvEditorFooter>{footerActions}</CvEditorFooter>
      ) : null}
    </div>
  );
}
