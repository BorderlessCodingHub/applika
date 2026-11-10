"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CloudOff,
  FilePenLine,
  Loader2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  useFormState,
  useWatch,
  type FieldErrors,
  type UseFormReturn,
} from "react-hook-form";
import type { AutosaveState } from "@/components/application-drafts/autosave-status";
import {
  DRAFT_STEPS,
  DRAFT_STEP_NUMBER,
  missingLabel,
  stepLabel,
  type DraftRequirement,
  type DraftStep,
} from "@/components/application-drafts/draft-copy";
import {
  getCurrencySymbol,
  type ApplicationFieldsValues,
} from "@/components/applications/application-fields";
import { CompanySelect } from "@/components/applications/company-select";
import {
  PlatformSelect,
  type NewPlatformInput,
  type PlatformCreateOutcome,
  type PlatformOption,
} from "@/components/applications/platform-select";
import type { CvFormValues } from "@/components/base-cvs/types";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { PhoneCvSections } from "@/components/phone/phone-cv-sections";
import {
  PhoneField,
  PhoneInput,
  PhoneTextarea,
} from "@/components/phone/phone-field";
import {
  PhoneLoadError,
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhoneOption, PhoneOptionGroup } from "@/components/phone/phone-option";
import { PhonePill } from "@/components/phone/phone-pill";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TailoredCv } from "@/components/tailored-cvs/types";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { cn } from "@/lib/utils";
import { SelectOptions } from "@/options";
import type {
  Company,
  ModeType,
  WorkModeType,
} from "@/services/types/applications";
import type { TailoringMode } from "@/services/types/tailored-cv";
import type {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "@/services/types/users";

const APPLICATIONS_HREF = "/applications";
const NEW_CV_HREF = "/cvs/new";

const APPLICATION_REQUIREMENTS: readonly DraftRequirement[] = [
  "company",
  "role",
  "platform",
];

/** Today's fields that sit under "More details" (Plan corrections 3). */
const DETAIL_FIELDS = [
  "mode",
  "application_date",
  "link_to_job",
  "country",
  "currency",
  "salary_period",
  "expected_salary",
  "salary_range_min",
  "salary_range_max",
  "observation",
] as const;

/** The board's summary rows, then the two the board leaves out once they hold something. */
const SUMMARY_SECTIONS = [
  "identity",
  "summary",
  "experience",
  "skills",
  "projects",
  "education",
] as const;

export type DraftScreenState =
  | { status: "loading" }
  | { status: "not-found" }
  | {
      status: "error";
      message: string;
      onRetry: () => void;
      retrying?: boolean;
    }
  | { status: "ready" };

/** Hands a picker slot what makes it the board's field: its id, label and error wiring. */
export interface DraftFieldSlot {
  /** The control's id; a visible `<label htmlFor>` points at it. */
  id: string;
  /** The error line's id while one shows. */
  describedBy: string | undefined;
  invalid: boolean;
}

export interface DraftAutosaveStatus {
  /** The active step's loop (`useDebouncedAutosave().status`). */
  status: AutosaveState;
  /** The draft exists and company, role or platform is empty: nothing is sent. */
  missingRequired?: boolean;
  /** Shown with "Not saved". */
  onRetry?: () => void;
}

/** The copy the draft holds, as step 2 summarises it. */
export interface DraftCopySummary {
  /** The master CV's name; `null` while unknown. */
  sourceName: string | null;
  /** `base_cv_id` is `null`: the master CV was deleted. */
  sourceDeleted: boolean;
  /** `cv.adjustments[].section`: the board's "Reordered" pill on those rows. */
  reorderedSections: readonly string[];
}

export interface DraftMasterCv {
  id: string;
  name: string;
  updatedAt: string | null;
}

export interface DraftScreenViewProps {
  /** The draft's own load (`?id=`): loading, not found, failed, or ready (also with no draft yet). */
  state: DraftScreenState;
  step: DraftStep;
  /** The page's `goToStep` (it re-syncs the company picker before step 1). */
  onStepChange: (step: DraftStep) => void;
  /** The draft exists: step 2 and "Continue to CV" open. */
  canOpenCv: boolean;
  autosave: DraftAutosaveStatus;

  /** Step 1: the page's application form (the desktop's `DraftApplicationStep` form). */
  form: UseFormReturn<ApplicationFieldsValues>;
  /** Today's `CompanySelect` with the page's `fetchCompanies`, value and `onCompanyChange`. */
  renderCompany: (slot: DraftFieldSlot) => ReactNode;
  /** Today's `PlatformSelect` with the page's platforms and `onCreatePlatform`. */
  renderPlatform: (slot: DraftFieldSlot) => ReactNode;
  /** Cancel forces a real navigation so `beforeunload` can warn (today's footer). */
  hasUnsavedRisk: boolean;

  /** Step 2: the copy (`null` = none yet: the picker), loading, or its failure (never the 404). */
  copy: PhoneLoad<DraftCopySummary | null>;
  /** `useBaseCvs()` for the picker. */
  masterCvs: PhoneLoad<readonly DraftMasterCv[]>;
  /** `jobs` and a SAVED non-blank job description: the "Tailor by keywords" card. */
  canTailorByKeywords: boolean;
  onCreateCopy: (baseCvId: string, tailoring: TailoringMode) => void;
  creatingCopy: boolean;
  /** The page's CV form: the summary rows read it, "Edit the CV copy" edits it (autosaved). */
  cvForm: UseFormReturn<CvFormValues>;
  /** Today's `CvFitPanel` (keeps `data-slot="cv-fit-panel"`), with `jobs` only. */
  fit?: ReactNode;

  /** Everything that stops Finish (`DRAFT_REQUIREMENT_ORDER`). */
  missing: readonly DraftRequirement[];
  onFinish: () => void;
  finishing: boolean;
  /** The server's words, in `[data-slot="draft-finish-error"]`. */
  finishError?: string | null;
}

/** v2/Draft below md: props in, the board out. */
export function DraftScreenView(props: DraftScreenViewProps) {
  const { state } = props;
  const t = useTranslations("drafts.page");
  const tPhone = useTranslations("phone.draft");

  const head = (
    <div>
      <h1 className="ph-h1 ph-dr-h1">{t("pageTitle")}</h1>
      <p className="ph-lead">{tPhone("lead")}</p>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div data-slot="phone-draft" className="ph-app ph-dr ph-dr-nobar">
        {head}
        <PhoneSkeleton label={t("loading")}>
          <PhoneSkeletonCard className="h-[58px] rounded-[18px]" />
          <PhoneSkeletonCard className="h-[320px]" />
        </PhoneSkeleton>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div data-slot="phone-draft" className="ph-app ph-dr ph-dr-nobar">
        {head}
        <div data-slot="draft-not-found" className="ph-card ph-dr-message">
          <p className="ph-dr-message-h">{t("notFoundTitle")}</p>
          <p className="ph-hint">{t("notFoundBody")}</p>
          <Link href={APPLICATIONS_HREF} className="ph-btn ph-sm ph-sec">
            {t("goToApplications")}
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div data-slot="phone-draft" className="ph-app ph-dr ph-dr-nobar">
        {head}
        <div role="alert" className="ph-dr-alert">
          <p className="ph-dr-message-h">{t("loadErrorTitle")}</p>
          <PhoneLoadError
            message={state.message}
            onRetry={state.onRetry}
            retrying={state.retrying}
          />
        </div>
      </div>
    );
  }

  return <DraftReady {...props} head={head} />;
}

function DraftReady({
  head,
  step,
  onStepChange,
  canOpenCv,
  autosave,
  form,
  renderCompany,
  renderPlatform,
  hasUnsavedRisk,
  copy,
  masterCvs,
  canTailorByKeywords,
  onCreateCopy,
  creatingCopy,
  cvForm,
  fit,
  missing,
  onFinish,
  finishing,
  finishError,
}: DraftScreenViewProps & { head: ReactNode }) {
  const t = useTranslations("drafts.page");
  const base = useId();
  const noteId = `${base}-note`;
  const stepButtons = useRef<
    Partial<Record<DraftStep, HTMLButtonElement | null>>
  >({});
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    stepButtons.current[step]?.focus();
  }, [step]);

  const applicationMissing = missing.filter((item) =>
    APPLICATION_REQUIREMENTS.includes(item),
  );
  const note =
    step === "application"
      ? !canOpenCv && applicationMissing.length > 0
        ? missingLabel(applicationMissing)
        : autosave.missingRequired
          ? t("requiredNotSaved")
          : null
      : missing.length > 0
        ? missingLabel(missing)
        : null;
  const showFinishError = step === "cv" && Boolean(finishError);
  const finishLocked = missing.length > 0 || finishing;

  return (
    <div
      data-slot="phone-draft"
      data-step={step}
      data-noted={note || showFinishError ? "" : undefined}
      className="ph-app ph-dr"
    >
      <PhoneTopBarEnd>
        <DraftAutosave {...autosave} />
      </PhoneTopBarEnd>

      {head}

      <nav
        aria-label={t("stepsLabel")}
        data-slot="draft-stepper"
        className="ph-dr-steps"
      >
        {DRAFT_STEPS.map((item) => (
          <StepButton
            key={item}
            step={item}
            current={item === step}
            disabled={item === "cv" && !canOpenCv}
            buttonRef={(node) => {
              stepButtons.current[item] = node;
            }}
            onSelect={() => onStepChange(item)}
          />
        ))}
      </nav>

      {step === "application" ? (
        <DraftApplicationFields
          form={form}
          renderCompany={renderCompany}
          renderPlatform={renderPlatform}
        />
      ) : (
        <DraftCvStepPhone
          copy={copy}
          masterCvs={masterCvs}
          canTailorByKeywords={canTailorByKeywords}
          onCreateCopy={onCreateCopy}
          creatingCopy={creatingCopy}
          cvForm={cvForm}
          fit={fit}
        />
      )}

      <PhoneActionBar className="ph-dr-bar">
        {showFinishError ? (
          <p
            role="alert"
            data-slot="draft-finish-error"
            className="ph-dr-note ph-dr-note-bad"
          >
            <CircleAlert size={16} aria-hidden="true" />
            <span>{finishError}</span>
          </p>
        ) : null}
        {note ? (
          <p id={noteId} data-slot="draft-missing" className="ph-dr-note">
            {note}
          </p>
        ) : null}
        {step === "application" ? (
          <>
            <Link
              href={APPLICATIONS_HREF}
              data-action="cancel-draft"
              className="ph-btn ph-sec ph-dr-lead-btn"
              onClick={(event) => {
                if (!hasUnsavedRisk) return;
                event.preventDefault();
                window.location.assign(APPLICATIONS_HREF);
              }}
            >
              {t("cancel")}
            </Link>
            <button
              type="button"
              data-action="continue-to-cv"
              aria-disabled={!canOpenCv || undefined}
              data-disabled={!canOpenCv || undefined}
              aria-describedby={note ? noteId : undefined}
              className="ph-btn ph-pri ph-dr-go-btn"
              onClick={() => {
                if (canOpenCv) onStepChange("cv");
              }}
            >
              {t("continueToCv")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-action="back"
              className="ph-btn ph-sec ph-dr-lead-btn"
              onClick={() => onStepChange("application")}
            >
              {t("back")}
            </button>
            <button
              type="button"
              data-action="finish"
              aria-disabled={finishLocked || undefined}
              aria-busy={finishing || undefined}
              data-disabled={finishLocked || undefined}
              aria-describedby={note ? noteId : undefined}
              className="ph-btn ph-pri ph-dr-go-btn"
              onClick={() => {
                if (!finishLocked) onFinish();
              }}
            >
              {finishing ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {t("finish")}
            </button>
          </>
        )}
      </PhoneActionBar>
    </div>
  );
}

/** "Saved" with the board's check; the loop's other states in the same place, one `role="status"`. */
function DraftAutosave({
  status,
  missingRequired = false,
  onRetry,
}: DraftAutosaveStatus) {
  const t = useTranslations("drafts.page");
  const shown = missingRequired ? "required" : status;
  return (
    <>
      <span
        role="status"
        data-slot="autosave-status"
        data-state={shown}
        className="ph-dr-status"
      >
        {shown === "saving" ? (
          <>
            <Loader2 size={14} aria-hidden="true" className="ph-spin" />
            {t("saving")}
          </>
        ) : shown === "saved" ? (
          <>
            <Check
              size={14}
              strokeWidth={2.25}
              aria-hidden="true"
              className="ph-dr-ok"
            />
            {t("saved")}
          </>
        ) : shown === "error" ? (
          <>
            <CloudOff size={14} aria-hidden="true" className="ph-dr-bad" />
            {t("notSaved")}
          </>
        ) : shown === "required" ? (
          <>
            <CircleAlert size={14} aria-hidden="true" className="ph-dr-warn" />
            {t("notSaved")}
          </>
        ) : null}
      </span>
      {shown === "error" && onRetry ? (
        <button
          type="button"
          data-action="retry-autosave"
          className="ph-btn ph-sm ph-sec"
          onClick={onRetry}
        >
          {t("retry")}
        </button>
      ) : null}
    </>
  );
}

function StepButton({
  step,
  current,
  disabled,
  buttonRef,
  onSelect,
}: {
  step: DraftStep;
  current: boolean;
  disabled: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onSelect: () => void;
}) {
  const t = useTranslations("drafts");
  const hintId = useId();
  return (
    <button
      ref={buttonRef}
      type="button"
      data-step={step}
      aria-label={stepLabel(step)}
      aria-describedby={hintId}
      aria-current={current ? "step" : undefined}
      aria-disabled={disabled || undefined}
      className={cn("ph-step", current && "ph-on")}
      onClick={() => {
        if (!disabled && !current) onSelect();
      }}
    >
      <span className="ph-n" aria-hidden="true">
        {DRAFT_STEP_NUMBER[step]}
      </span>
      <span className="ph-step-text">
        <span className="ph-step-t">{t(`steps.${step}.title`)}</span>
        <span id={hintId} className="ph-step-s">
          {t(`steps.${step}.hint`)}
        </span>
      </span>
    </button>
  );
}

type CompanyFieldError = {
  message?: string;
  name?: { message?: string };
  url?: { message?: string };
};

function messageOf(
  errors: FieldErrors<ApplicationFieldsValues>,
  field: keyof ApplicationFieldsValues,
): string | undefined {
  const message = errors[field]?.message;
  return typeof message === "string" ? message : undefined;
}

/** Step 1: the board's six fields, then today's others under "More details". */
function DraftApplicationFields({
  form,
  renderCompany,
  renderPlatform,
}: {
  form: UseFormReturn<ApplicationFieldsValues>;
  renderCompany: (slot: DraftFieldSlot) => ReactNode;
  renderPlatform: (slot: DraftFieldSlot) => ReactNode;
}) {
  const t = useTranslations("applications.fields");
  const tPhone = useTranslations("phone.draft");
  const tQuick = useTranslations("phone.quickAdd");
  const { errors } = useFormState({ control: form.control });
  const base = useId();
  const ids = {
    company: `${base}-company`,
    platform: `${base}-platform`,
    date: `${base}-date`,
    details: `${base}-details`,
    more: `${base}-more`,
    moreHint: `${base}-more-hint`,
    salaryHint: `${base}-salary-hint`,
  };

  const [mode, workMode, experience, date, currency, period] = useWatch({
    control: form.control,
    name: [
      "mode",
      "work_mode",
      "experience_level",
      "application_date",
      "currency",
      "salary_period",
    ],
  });
  const salaryEnabled = Boolean(currency && period);
  const symbol = currency ? getCurrencySymbol(currency) : "$";

  const companyErrors = errors.company as CompanyFieldError | undefined;
  const companyError =
    companyErrors?.message ??
    companyErrors?.name?.message ??
    companyErrors?.url?.message;
  const platformError = messageOf(errors, "platform_id");

  // "More details" opens itself when a field inside it starts failing, and
  // stays open until the user folds it (never folds away under typing).
  const detailsErrorKey = DETAIL_FIELDS.filter((field) => errors[field]).join(
    ",",
  );
  const [details, setDetails] = useState({ key: detailsErrorKey, open: false });
  if (details.key !== detailsErrorKey) {
    setDetails({
      key: detailsErrorKey,
      open: details.open || detailsErrorKey !== "",
    });
  }

  return (
    <div data-slot="draft-application-step" className="ph-dr-fields">
      <SlotField
        id={ids.company}
        label={t("company")}
        error={companyError}
        render={renderCompany}
      />
      <PhoneField label={t("role")} error={messageOf(errors, "role")}>
        <PhoneInput
          {...form.register("role")}
          placeholder={t("rolePlaceholder")}
          aria-required={true}
          autoComplete="off"
        />
      </PhoneField>
      <SlotField
        id={ids.platform}
        label={t("platform")}
        error={platformError}
        render={renderPlatform}
      />
      <div className="ph-dr-pair">
        <SelectField<SeniorityLevelType>
          label={tPhone("experience")}
          value={experience}
          options={SelectOptions.SENIORITY}
          placeholder={t("select")}
          onChange={(value) =>
            form.setValue("experience_level", value, { shouldValidate: true })
          }
        />
        <SelectField<WorkModeType>
          label={t("workMode")}
          value={workMode}
          options={SelectOptions.WORK_MODE}
          placeholder={t("select")}
          onChange={(value) =>
            form.setValue("work_mode", value, { shouldValidate: true })
          }
        />
      </div>
      <PhoneField
        label={t("jobDescription")}
        error={messageOf(errors, "job_description")}
      >
        <PhoneTextarea
          {...form.register("job_description")}
          rows={4}
          placeholder={t("jobDescriptionPlaceholder")}
        />
      </PhoneField>

      <button
        type="button"
        aria-expanded={details.open}
        aria-controls={ids.details}
        aria-labelledby={ids.more}
        aria-describedby={ids.moreHint}
        data-action="more-details"
        className="ph-qa-more"
        onClick={() => setDetails({ ...details, open: !details.open })}
      >
        <span id={ids.more}>{tQuick("moreDetails")}</span>
        <span id={ids.moreHint} className="ph-qa-more-hint">
          <span className="truncate">{tPhone("moreDetailsHint")}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="ph-qa-more-chev shrink-0"
          />
        </span>
      </button>

      {/* Hidden, not unmounted: the date and the rest stay registered while folded. */}
      <div
        id={ids.details}
        hidden={!details.open}
        data-slot="draft-more-details"
        className="ph-dr-fields"
      >
        <SelectField<ModeType>
          label={t("source")}
          value={mode}
          options={SelectOptions.SOURCE}
          placeholder={t("select")}
          required
          error={messageOf(errors, "mode")}
          onChange={(value) =>
            form.setValue("mode", value, { shouldValidate: true })
          }
        />
        <div className="ph-field ph-input-host">
          <span id={`${ids.date}-label`} className="ph-lbl">
            {t("applicationDate")}
          </span>
          <DatePickerInput
            id={ids.date}
            value={date}
            onChange={(next) =>
              form.setValue("application_date", next ?? "", {
                shouldValidate: true,
              })
            }
            maxDate={new Date()}
            aria-labelledby={`${ids.date}-label`}
            aria-invalid={errors.application_date ? true : undefined}
            aria-describedby={
              errors.application_date ? `${ids.date}-error` : undefined
            }
          />
          <FieldError
            id={`${ids.date}-error`}
            message={messageOf(errors, "application_date")}
          />
        </div>
        <PhoneField
          label={t("jobLink")}
          error={messageOf(errors, "link_to_job")}
        >
          <PhoneInput
            {...form.register("link_to_job")}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder={tQuick("linkPlaceholder")}
          />
        </PhoneField>
        <PhoneField label={t("country")}>
          <PhoneInput
            {...form.register("country")}
            autoComplete="country-name"
            placeholder={t("countryPlaceholder")}
          />
        </PhoneField>
        <div className="ph-dr-pair">
          <SelectField<SalaryCurrencyType>
            label={t("currency")}
            value={currency}
            options={SelectOptions.CURRENCY.map((option) => ({
              value: option.value,
              label: `${option.symbol} — ${option.value}`,
            }))}
            placeholder={t("select")}
            error={messageOf(errors, "currency")}
            onChange={(value) =>
              form.setValue("currency", value, { shouldValidate: true })
            }
          />
          <SelectField<SalaryPeriodType>
            label={t("salaryPeriod")}
            value={period}
            options={SelectOptions.SALARY_PERIOD}
            placeholder={t("select")}
            error={messageOf(errors, "salary_period")}
            onChange={(value) =>
              form.setValue("salary_period", value, { shouldValidate: true })
            }
          />
        </div>
        <div className="ph-field">
          <div
            className="ph-dr-tri"
            data-disabled={salaryEnabled ? undefined : ""}
          >
            {(
              [
                ["expected_salary", t("expected")],
                ["salary_range_min", t("min")],
                ["salary_range_max", t("max")],
              ] as const
            ).map(([field, label]) => (
              <PhoneField key={field} label={label}>
                <div className="ph-dr-amount">
                  <span className="ph-dr-sym" aria-hidden="true">
                    {symbol}
                  </span>
                  <PhoneInput
                    {...form.register(field, { valueAsNumber: true })}
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    disabled={!salaryEnabled}
                    aria-describedby={
                      salaryEnabled ? undefined : ids.salaryHint
                    }
                    className="ph-mono ph-dr-amount-input"
                  />
                </div>
              </PhoneField>
            ))}
          </div>
          {salaryEnabled ? null : (
            <p id={ids.salaryHint} className="ph-hint">
              {t("salaryHint")}
            </p>
          )}
        </div>
        <PhoneField label={t("notes")}>
          <PhoneTextarea
            {...form.register("observation")}
            rows={3}
            placeholder={t("notesPlaceholder")}
          />
        </PhoneField>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} data-slot="phone-field-error" className="ph-hint ph-dr-error">
      {message}
    </p>
  );
}

/** A picker the page renders (company, platform), drawn as the board's `.input`. */
function SlotField({
  id,
  label,
  error,
  render,
}: {
  id: string;
  label: string;
  error?: string;
  render: (slot: DraftFieldSlot) => ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="ph-field ph-input-host">
      <label htmlFor={id} className="ph-lbl">
        {label}
      </label>
      {render({
        id,
        describedBy: error ? errorId : undefined,
        invalid: Boolean(error),
      })}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** Today's `Select` drawn as the board's `.input`; its list rows get a 44px box. */
function SelectField<V extends string>({
  label,
  value,
  options,
  placeholder,
  required,
  error,
  onChange,
}: {
  label: string;
  value: V | undefined;
  options: readonly { value: V; label: string }[];
  placeholder: string;
  required?: boolean;
  error?: string;
  onChange: (value: V) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="ph-field ph-input-host">
      <label htmlFor={id} className="ph-lbl">
        {label}
      </label>
      <Select value={value ?? ""} onValueChange={(next) => onChange(next as V)}>
        <SelectTrigger
          id={id}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** Step 2: the picker before a copy exists, then the board's summary and "Edit the CV copy". */
function DraftCvStepPhone({
  copy,
  masterCvs,
  canTailorByKeywords,
  onCreateCopy,
  creatingCopy,
  cvForm,
  fit,
}: Pick<
  DraftScreenViewProps,
  | "copy"
  | "masterCvs"
  | "canTailorByKeywords"
  | "onCreateCopy"
  | "creatingCopy"
  | "cvForm"
  | "fit"
>) {
  const t = useTranslations("phone.draft");
  return (
    <div data-slot="draft-cv-step" className="ph-dr-cv">
      <PhoneLoadable
        state={copy}
        className="ph-dr-cv"
        loading={
          <PhoneSkeleton label={t("loadingCopy")}>
            <PhoneSkeletonCard className="h-[84px]" />
            <PhoneSkeletonCard className="h-[312px]" />
          </PhoneSkeleton>
        }
      >
        {(summary) =>
          summary ? (
            <DraftCopy summary={summary} cvForm={cvForm} fit={fit} />
          ) : (
            <DraftCopyPicker
              masterCvs={masterCvs}
              canTailorByKeywords={canTailorByKeywords}
              onCreateCopy={onCreateCopy}
              creatingCopy={creatingCopy}
            />
          )
        }
      </PhoneLoadable>
    </div>
  );
}

function TailorCard({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const tTailor = useTranslations("cvs.tailored.tailorByKeywords");
  const t = useTranslations("phone.draft");
  const base = useId();
  return (
    <div data-slot="tailor-by-keywords" className="ph-card ph-dr-tailor">
      <span className="ph-dr-tailor-text">
        <span id={`${base}-t`} className="ph-dr-tailor-t">
          {tTailor("label")}
        </span>
        <span id={`${base}-s`} className="ph-dr-tailor-s">
          {t("tailorHint")}
        </span>
      </span>
      <PhoneSwitch
        checked={checked}
        aria-labelledby={`${base}-t`}
        aria-describedby={`${base}-s`}
        aria-disabled={disabled || undefined}
        onCheckedChange={(next) => {
          if (!disabled) onCheckedChange(next);
        }}
      />
    </div>
  );
}

function DraftCopyPicker({
  masterCvs,
  canTailorByKeywords,
  onCreateCopy,
  creatingCopy,
}: Pick<
  DraftScreenViewProps,
  "masterCvs" | "canTailorByKeywords" | "onCreateCopy" | "creatingCopy"
>) {
  const t = useTranslations("cvs.tailored.picker");
  const tPage = useTranslations("drafts.page");
  const tCard = useTranslations("cvs.card");
  const tPhone = useTranslations("phone.draft");
  const format = useFormatter();
  const legendId = useId();
  // Off by default every time the picker shows (R-026: the verbatim copy is the default).
  const [tailor, setTailor] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <PhoneLoadable
      state={masterCvs}
      className="ph-dr-cv"
      loading={
        <PhoneSkeleton label={tPhone("loadingMasterCvs")}>
          <PhoneSkeletonCard className="h-[66px] rounded-2xl" />
          <PhoneSkeletonCard className="h-[66px] rounded-2xl" />
        </PhoneSkeleton>
      }
    >
      {(cvs) => {
        if (cvs.length === 0) {
          return (
            <div
              data-slot="draft-no-master-cv"
              className="ph-card ph-dr-message"
            >
              <span className="ph-dr-message-ic" aria-hidden="true">
                <FilePenLine size={22} />
              </span>
              <p className="ph-dr-message-h">{tPage("noMasterCvTitle")}</p>
              <p className="ph-hint">{tPage("noMasterCvBody")}</p>
              <Link href={NEW_CV_HREF} className="ph-btn ph-sm ph-pri">
                {tPage("noMasterCvCta")}
              </Link>
            </div>
          );
        }
        // No default master CV; a lone one is preselected (`preselectedBaseCvId`).
        const selected =
          picked && cvs.some((cv) => cv.id === picked)
            ? picked
            : cvs.length === 1
              ? cvs[0].id
              : null;
        const locked = !selected || creatingCopy;
        return (
          <>
            {canTailorByKeywords ? (
              <TailorCard
                checked={tailor}
                onCheckedChange={setTailor}
                disabled={creatingCopy}
              />
            ) : null}
            <fieldset className="ph-sa-fieldset">
              <legend id={legendId} className="ph-lbl ph-sa-legend">
                {t("title")}
              </legend>
              <p className="ph-hint ph-sa-hint">{t("hint")}</p>
              <PhoneOptionGroup
                labelledBy={legendId}
                value={selected ?? undefined}
                onValueChange={setPicked}
                disabled={creatingCopy}
              >
                {cvs.map((cv) => {
                  const updated = cv.updatedAt ? new Date(cv.updatedAt) : null;
                  return (
                    <PhoneOption
                      key={cv.id}
                      value={cv.id}
                      title={cv.name}
                      hint={
                        updated && !Number.isNaN(updated.getTime())
                          ? tCard("updated", {
                              date: format.dateTime(updated, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }),
                            })
                          : undefined
                      }
                    />
                  );
                })}
              </PhoneOptionGroup>
            </fieldset>
            <button
              type="button"
              data-action="create-cv-copy"
              aria-disabled={locked || undefined}
              aria-busy={creatingCopy || undefined}
              data-disabled={locked || undefined}
              className="ph-btn ph-pri"
              onClick={() => {
                if (!locked && selected) {
                  onCreateCopy(
                    selected,
                    canTailorByKeywords && tailor ? "keywords" : "copy",
                  );
                }
              }}
            >
              {creatingCopy ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {t("create")}
            </button>
          </>
        );
      }}
    </PhoneLoadable>
  );
}

function DraftCopy({
  summary,
  cvForm,
  fit,
}: {
  summary: DraftCopySummary;
  cvForm: UseFormReturn<CvFormValues>;
  fit?: ReactNode;
}) {
  const t = useTranslations("phone.draft");
  const tDrafts = useTranslations("drafts.section");
  const tSource = useTranslations("cvs.tailored.source");
  const tSections = useTranslations("cvs.sections");
  const tCard = useTranslations("cvs.card");
  const values = useWatch({ control: cvForm.control }) as Partial<CvFormValues>;
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<RefObject<HTMLButtonElement | null> | null>(null);
  useEffect(() => {
    focusNext.current?.current?.focus();
    focusNext.current = null;
  }, [editing]);

  const reordered = new Set(summary.reorderedSections);

  function metaFor(id: string): ReactNode {
    if (reordered.has(id)) {
      return <PhonePill tone="pri">{t("reordered")}</PhonePill>;
    }
    switch (id) {
      case "identity":
        return values.full_name?.trim() ? (
          <span className="ph-mono ph-dr-sec-meta">{values.full_name}</span>
        ) : null;
      case "summary":
        return (
          <span className="ph-dr-sec-meta">
            {t("meta.summary", { count: values.summary?.trim().length ?? 0 })}
          </span>
        );
      case "experience":
        return (
          <span className="ph-dr-sec-meta">
            {tCard("roles", { count: values.experience?.length ?? 0 })}
          </span>
        );
      case "skills":
        return (
          <span className="ph-dr-sec-meta">
            {t("meta.skills", { count: values.skills?.length ?? 0 })}
          </span>
        );
      case "projects":
        return (
          <span className="ph-dr-sec-meta">
            {tCard("projects", { count: values.projects?.length ?? 0 })}
          </span>
        );
      case "education":
        return (
          <span className="ph-dr-sec-meta">
            {t("meta.education", { count: values.education?.length ?? 0 })}
          </span>
        );
      case "certifications":
        return (
          <span className="ph-dr-sec-meta">
            {t("meta.certifications", {
              count: values.certifications?.length ?? 0,
            })}
          </span>
        );
      case "languages":
        return (
          <span className="ph-dr-sec-meta">
            {tCard("languages", { count: values.languages?.length ?? 0 })}
          </span>
        );
      default:
        return null;
    }
  }

  const rows: { id: string; meta: ReactNode }[] = [
    ...SUMMARY_SECTIONS.map((id) => ({ id, meta: metaFor(id) })),
    ...(values.certifications?.length
      ? [{ id: "certifications", meta: metaFor("certifications") }]
      : []),
    ...(values.languages?.length
      ? [{ id: "languages", meta: metaFor("languages") }]
      : []),
  ];

  const source = summary.sourceDeleted
    ? tSource("deleted")
    : summary.sourceName
      ? tSource("copiedFrom", { name: summary.sourceName })
      : tSource("copiedFromMaster");

  if (editing) {
    return (
      <div data-slot="draft-cv-editor" className="ph-dr-cv">
        <div className="ph-dr-edit-head">
          <h2 className="ph-h2">{t("editTitle")}</h2>
          <button
            ref={doneButton}
            type="button"
            data-action="done-editing-cv"
            className="ph-btn ph-sm ph-sec"
            onClick={() => {
              focusNext.current = editButton;
              setEditing(false);
            }}
          >
            {t("done")}
          </button>
        </div>
        <p className="ph-hint">{t("editHint")}</p>
        <PhoneCvSections form={cvForm} headingLevel="h3" />
      </div>
    );
  }

  return (
    <div data-slot="draft-cv-copy" className="ph-dr-cv">
      <p className="ph-dr-copied">
        <PhonePill>{tDrafts("cvCopy")}</PhonePill>
        <span className="ph-dr-copied-text">{source}</span>
      </p>
      <ul aria-label={t("sectionsLabel")} className="ph-group">
        {rows.map((row) => (
          <li key={row.id} data-section={row.id} className="ph-sec-row">
            <span className="ph-dr-sec-name">
              {tSections(`${row.id}.title`)}
            </span>
            {row.meta}
          </li>
        ))}
      </ul>
      {fit}
      <button
        ref={editButton}
        type="button"
        data-action="edit-cv-copy"
        className="ph-btn ph-sec"
        onClick={() => {
          focusNext.current = doneButton;
          setEditing(true);
        }}
      >
        {t("editCopy")}
      </button>
    </div>
  );
}

export interface DraftScreenProps extends Omit<
  DraftScreenViewProps,
  "renderCompany" | "renderPlatform" | "masterCvs" | "copy"
> {
  /** The page's company search, seed and name callback (today's `CompanySelect`). */
  fetchCompanies: (query: string) => Promise<Company[]>;
  companySelectValue: Company | null;
  onCompanyChange: (company: Company | null) => void;
  /** The page's platforms and create call (today's `PlatformSelect`). */
  platforms: readonly PlatformOption[] | undefined;
  platformsLoading?: boolean;
  onCreatePlatform: (input: NewPlatformInput) => Promise<PlatformCreateOutcome>;
  /** The page's CV copy query: `null` = none yet, loading, or its failure (never the 404). */
  copy: PhoneLoad<TailoredCv | null>;
}

/**
 * v2/Draft on the page's state: `new-with-cv-page.tsx` keeps both forms,
 * both autosave loops and every call, and renders this below md after all
 * its hooks ran. Only the master CVs (the step 2 picker and the copy's
 * "Copied from") are read here, so the desktop's step 1 sends nothing new.
 */
export function DraftScreen({
  fetchCompanies,
  companySelectValue,
  onCompanyChange,
  platforms,
  platformsLoading,
  onCreatePlatform,
  copy,
  form,
  ...props
}: DraftScreenProps) {
  const baseCvs = useBaseCvs();
  const platformId = useWatch({ control: form.control, name: "platform_id" });

  return (
    <DraftScreenView
      {...props}
      form={form}
      copy={mapLoad(copy, (cv) =>
        cv
          ? {
              sourceName:
                baseCvs.data?.find((item) => item.id === cv.base_cv_id)?.name ??
                null,
              sourceDeleted: cv.base_cv_id === null,
              reorderedSections: cv.adjustments.map((item) => item.section),
            }
          : null,
      )}
      masterCvs={mapLoad(fromQuery(baseCvs), (list) =>
        list.map((cv) => ({
          id: cv.id,
          name: cv.name,
          updatedAt: cv.updated_at,
        })),
      )}
      renderCompany={(slot) => (
        <CompanySelect
          id={slot.id}
          value={companySelectValue}
          form={form}
          fetchCompanies={fetchCompanies}
          onCompanyChange={onCompanyChange}
          aria-invalid={slot.invalid || undefined}
          aria-describedby={slot.describedBy}
          aria-required
        />
      )}
      renderPlatform={(slot) => (
        <PlatformSelect
          id={slot.id}
          options={platforms}
          isLoading={platformsLoading}
          value={String(platformId || "")}
          onValueChange={(value) =>
            form.setValue("platform_id", value as never, {
              shouldValidate: true,
            })
          }
          onCreate={onCreatePlatform}
          aria-invalid={slot.invalid || undefined}
          aria-describedby={slot.describedBy}
          aria-required
        />
      )}
    />
  );
}
