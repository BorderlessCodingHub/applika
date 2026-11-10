"use client";

import {
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RadioGroup } from "radix-ui";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import {
  isNotFutureCalendarDay,
  localCalendarDay,
} from "@/components/application-drafts/draft-copy";
import {
  CompanySelect,
  ZodType,
} from "@/components/applications/company-select";
import { PlatformSelect } from "@/components/applications/platform-select";
import {
  PhoneSheetClose,
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useAuth } from "@/contexts/auth-context";
import { useCycleContext } from "@/contexts/cycle-context";
import {
  useApplicationMutate,
  useApplications,
} from "@/hooks/use-applications";
import { useCompanySearch } from "@/hooks/use-companies";
import { useCreatePlatformOutcome } from "@/hooks/use-create-platform";
import { useHasFeature } from "@/hooks/use-features";
import { usePlatforms } from "@/hooks/use-platforms";
import { word } from "@/i18n/translator";
import { getApiError } from "@/lib/api-client";
import { addDays } from "@/lib/phone-format";
import {
  WorkModeValues,
  type CreateApplicationPayload,
  type WorkModeType,
} from "@/services/types/applications";
import type { AxiosError } from "axios";

/** The "Other" chip's value: it shows today's platform picker under the chips. */
export const QUICK_ADD_OTHER_PLATFORM = "other";

export type QuickAddDate = "today" | "yesterday" | "pick";

const DATE_CHOICES: readonly QuickAddDate[] = ["today", "yesterday", "pick"];

export interface QuickAddPlatform {
  id: string;
  name: string;
}

/** What the view hands a slot so its control is named and wired like the board's field. */
export interface QuickAddSlot {
  /** The control's id: a visible `<label htmlFor>` points at it. */
  id: string;
  /** The id of the visible words naming it, for `aria-labelledby`. */
  labelledBy: string;
  /** The error line's id while one shows. */
  describedBy: string | undefined;
  invalid: boolean;
}

export interface QuickAddSheetViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** react-hook-form's `handleSubmit(...)`; the CTA submits it from the footer. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** The create is in flight: the CTA stays focusable and ignores taps. */
  pending?: boolean;
  /** Today's `CompanySelect`: give it `id`, `placeholder`, `aria-invalid`, `aria-describedby`. */
  renderCompany: (slot: QuickAddSlot & { placeholder: string }) => ReactNode;
  companyError?: string;
  /** `form.register("role")`. */
  roleInput: ComponentProps<"input">;
  roleError?: string;
  /** The chips before "Other" (`usePlatforms`, up to three). */
  platforms: readonly QuickAddPlatform[];
  /** A chip's id, `QUICK_ADD_OTHER_PLATFORM`, or `null` for none yet. */
  platform: string | null;
  onPlatformChange: (value: string) => void;
  /** Today's `PlatformSelect`, shown while "Other" is checked: give it `aria-labelledby` and the rest. */
  renderOtherPlatform: (slot: QuickAddSlot) => ReactNode;
  platformError?: string;
  date: QuickAddDate;
  onDateChange: (value: QuickAddDate) => void;
  /** Today's `DatePickerInput`, shown while "Pick a date" is checked. */
  renderPickedDate: (slot: QuickAddSlot) => ReactNode;
  dateError?: string;
  /** "More details": open it when a field inside it fails validation. */
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  /** `form.register("link_to_job")`. */
  linkInput: ComponentProps<"input">;
  linkError?: string;
  workMode: WorkModeType | null;
  onWorkModeChange: (value: WorkModeType) => void;
  salaryFromInput: ComponentProps<"input">;
  salaryToInput: ComponentProps<"input">;
  salaryError?: string;
  /** With `cvs` only: shows "Start with a CV instead", which also closes the sheet. */
  startWithCvHref?: string;
  /** The create's failure (`getApiError`), above the CTA. */
  formError?: string;
}

/** v2/QuickAdd below md, on the phone sheet frame: props in, the board out. */
export function QuickAddSheetView({
  open,
  onOpenChange,
  onSubmit,
  pending = false,
  renderCompany,
  companyError,
  roleInput,
  roleError,
  platforms,
  platform,
  onPlatformChange,
  renderOtherPlatform,
  platformError,
  date,
  onDateChange,
  renderPickedDate,
  dateError,
  detailsOpen,
  onDetailsOpenChange,
  linkInput,
  linkError,
  workMode,
  onWorkModeChange,
  salaryFromInput,
  salaryToInput,
  salaryError,
  startWithCvHref,
  formError,
}: QuickAddSheetViewProps) {
  const t = useTranslations("phone.quickAdd");
  const tCommon = useTranslations("common");
  const tWorkMode = useTranslations("options.workMode");
  const formId = useId();
  const companyId = useId();
  const companyLabelId = useId();
  const roleId = useId();
  const whereId = useId();
  const platformId = useId();
  const appliedOnId = useId();
  const pickedDateId = useId();
  const moreId = useId();
  const moreHintId = useId();
  const detailsId = useId();
  const linkId = useId();
  const workModeId = useId();
  const salaryFromId = useId();
  const salaryToId = useId();
  const errorId = (base: string, error?: string) =>
    error ? `${base}-error` : undefined;

  return (
    <PhoneSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      described
      scrimClassName="ph-qa-scrim"
      className="ph-qa-sheet"
    >
      <div aria-hidden="true" className="ph-qa-grab">
        <span />
      </div>
      <div className="ph-qa-head">
        <PhoneSheetTitle asChild>
          <h1 className="ph-qa-title">{t("title")}</h1>
        </PhoneSheetTitle>
        <PhoneSheetClose aria-label={tCommon("close")} className="ph-qa-close">
          <X size={22} aria-hidden="true" />
        </PhoneSheetClose>
      </div>
      <PhoneSheetDescription className="ph-qa-lead">
        {t("lead")}
      </PhoneSheetDescription>

      <form
        id={formId}
        noValidate
        onSubmit={onSubmit}
        data-slot="quick-add-form"
        className="ph-scroll ph-qa-form"
      >
        <div className="ph-lbl-strong" data-field="company">
          <label id={companyLabelId} htmlFor={companyId}>
            {t("company")}
          </label>
          <div className="ph-input-soft-host">
            {renderCompany({
              id: companyId,
              labelledBy: companyLabelId,
              describedBy: errorId(companyId, companyError),
              invalid: Boolean(companyError),
              placeholder: t("companyPlaceholder"),
            })}
          </div>
          <FieldError id={errorId(companyId, companyError)}>
            {companyError}
          </FieldError>
        </div>

        <div className="ph-lbl-strong" data-field="role">
          <label htmlFor={roleId}>{t("role")}</label>
          <input
            {...roleInput}
            id={roleId}
            type="text"
            placeholder={t("rolePlaceholder")}
            aria-invalid={roleError ? true : undefined}
            aria-describedby={errorId(roleId, roleError)}
            className="ph-input-soft"
          />
          <FieldError id={errorId(roleId, roleError)}>{roleError}</FieldError>
        </div>

        <div className="flex flex-col gap-2" data-field="platform">
          <RadioGroup.Root
            aria-labelledby={whereId}
            aria-describedby={errorId(platformId, platformError)}
            aria-required
            value={platform ?? ""}
            onValueChange={onPlatformChange}
            className="ph-qa-group"
          >
            <span id={whereId} className="ph-qa-group-lbl">
              {t("where")}
            </span>
            <div className="ph-qa-choices">
              {platforms.map((option) => (
                <Choice key={option.id} value={option.id}>
                  {option.name}
                </Choice>
              ))}
              <Choice value={QUICK_ADD_OTHER_PLATFORM}>{t("other")}</Choice>
            </div>
          </RadioGroup.Root>
          {platform === QUICK_ADD_OTHER_PLATFORM ? (
            <div className="ph-input-soft-host">
              {renderOtherPlatform({
                id: platformId,
                labelledBy: whereId,
                describedBy: errorId(platformId, platformError),
                invalid: Boolean(platformError),
              })}
            </div>
          ) : null}
          <FieldError id={errorId(platformId, platformError)}>
            {platformError}
          </FieldError>
        </div>

        <div className="flex flex-col gap-2" data-field="date">
          <RadioGroup.Root
            aria-labelledby={appliedOnId}
            aria-describedby={errorId(pickedDateId, dateError)}
            value={date}
            onValueChange={(value) => onDateChange(value as QuickAddDate)}
            className="ph-qa-group"
          >
            <span id={appliedOnId} className="ph-qa-group-lbl">
              {t("appliedOn")}
            </span>
            <div className="ph-qa-choices">
              {DATE_CHOICES.map((choice) => (
                <Choice key={choice} value={choice}>
                  {choice === "pick" ? t("pickDate") : t(choice)}
                </Choice>
              ))}
            </div>
          </RadioGroup.Root>
          {date === "pick" ? (
            <div className="ph-input-soft-host">
              {renderPickedDate({
                id: pickedDateId,
                labelledBy: appliedOnId,
                describedBy: errorId(pickedDateId, dateError),
                invalid: Boolean(dateError),
              })}
            </div>
          ) : null}
          <FieldError id={errorId(pickedDateId, dateError)}>
            {dateError}
          </FieldError>
        </div>

        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          aria-labelledby={moreId}
          aria-describedby={moreHintId}
          data-action="more-details"
          className="ph-qa-more"
          onClick={() => onDetailsOpenChange(!detailsOpen)}
        >
          <span id={moreId}>{t("moreDetails")}</span>
          <span id={moreHintId} className="ph-qa-more-hint">
            <span className="truncate">{t("moreDetailsHint")}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="ph-qa-more-chev shrink-0"
            />
          </span>
        </button>

        {/* Hidden, not unmounted: what was typed behind it stays when it folds. */}
        <div id={detailsId} hidden={!detailsOpen} className="ph-qa-details">
          <div className="ph-lbl-strong" data-field="link">
            <label htmlFor={linkId}>{t("link")}</label>
            <input
              {...linkInput}
              id={linkId}
              type="url"
              inputMode="url"
              placeholder={t("linkPlaceholder")}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={errorId(linkId, linkError)}
              className="ph-input-soft"
            />
            <FieldError id={errorId(linkId, linkError)}>{linkError}</FieldError>
          </div>

          <RadioGroup.Root
            aria-labelledby={workModeId}
            value={workMode ?? ""}
            onValueChange={(value) => onWorkModeChange(value as WorkModeType)}
            data-field="work-mode"
            className="ph-qa-group"
          >
            <span id={workModeId} className="ph-qa-group-lbl">
              {t("workMode")}
            </span>
            <div className="ph-qa-choices">
              {WorkModeValues.map((mode) => (
                <Choice key={mode} value={mode}>
                  {tWorkMode(mode)}
                </Choice>
              ))}
            </div>
          </RadioGroup.Root>

          <div className="flex flex-col gap-2" data-field="salary">
            <div className="ph-qa-salary">
              <div className="ph-lbl-strong">
                <label htmlFor={salaryFromId}>{t("salaryFrom")}</label>
                <input
                  {...salaryFromInput}
                  id={salaryFromId}
                  type="text"
                  inputMode="numeric"
                  placeholder={t("salaryFromPlaceholder")}
                  aria-invalid={salaryError ? true : undefined}
                  aria-describedby={errorId(salaryFromId, salaryError)}
                  className="ph-input-soft ph-mono"
                />
              </div>
              <div className="ph-lbl-strong">
                <label htmlFor={salaryToId}>{t("salaryTo")}</label>
                <input
                  {...salaryToInput}
                  id={salaryToId}
                  type="text"
                  inputMode="numeric"
                  placeholder={t("salaryToPlaceholder")}
                  aria-label={t("salaryToName")}
                  aria-invalid={salaryError ? true : undefined}
                  aria-describedby={errorId(salaryFromId, salaryError)}
                  className="ph-input-soft ph-mono"
                />
              </div>
            </div>
            <FieldError id={errorId(salaryFromId, salaryError)}>
              {salaryError}
            </FieldError>
          </div>
        </div>
      </form>

      <div className="ph-qa-foot">
        {formError ? (
          <p
            role="alert"
            data-slot="quick-add-error"
            className="ph-qa-error mb-1 text-center"
          >
            {formError}
          </p>
        ) : null}
        {startWithCvHref ? (
          <Link
            href={startWithCvHref}
            data-action="start-with-cv"
            className="ph-qa-cv"
            onClick={() => onOpenChange(false)}
          >
            {t("startWithCv")}
          </Link>
        ) : null}
        {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
        <button
          type="submit"
          form={formId}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          data-action="add-to-pipeline"
          className="ph-qa-cta gap-2"
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {pending ? (
            <Loader2 size={18} aria-hidden="true" className="ph-spin" />
          ) : null}
          {t("submit")}
        </button>
      </div>
    </PhoneSheetFrame>
  );
}

function Choice({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadioGroup.Item value={value} className="ph-choice">
      <span>{children}</span>
    </RadioGroup.Item>
  );
}

function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!id || !children) return null;
  return (
    <p id={id} className="ph-qa-error">
      {children}
    </p>
  );
}

/** The chips before "Other": the platforms the user applies through most, then the API's order (by name). */
export const QUICK_ADD_PLATFORM_CHIPS = 3;

/** A validation message read at validation time, in the active language. */
function message(key: string) {
  return { error: () => word(`applications.validation.${key}`) };
}

/** "60,000", "60.000" and "60000" are all sixty thousand; blank is none; anything else is `NaN`. */
function salaryAmount(value: string): number | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  if (!/^[\d.,\s]+$/.test(text)) return Number.NaN;
  const digits = text.replace(/[^\d]/g, "");
  return digits === "" ? Number.NaN : Number(digits);
}

const schema = z
  .object({
    company: ZodType.ZodSchema,
    role: z.string().trim().min(1, message("roleRequired")),
    platform_id: z.string().min(1, message("platformRequired")),
    application_date: z
      .string()
      .min(1, message("dateRequired"))
      .refine(
        (value) => isNotFutureCalendarDay(value),
        message("dateInFuture"),
      ),
    link_to_job: z.union([z.literal(""), z.httpUrl(message("invalidUrl"))]),
    work_mode: z.enum(WorkModeValues).optional(),
    salary_from: z.string(),
    salary_to: z.string(),
    /** The profile has a salary currency and period (set by the sheet, never by the user). */
    salary_unit: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const amounts = [
      salaryAmount(data.salary_from),
      salaryAmount(data.salary_to),
    ];
    if (
      amounts.some((amount) => amount !== undefined && Number.isNaN(amount))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_from"],
        message: word("phone.quickAdd.salaryInvalid"),
      });
      return;
    }
    if (amounts.some((amount) => amount !== undefined) && !data.salary_unit) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_from"],
        message: word("phone.quickAdd.salaryNeedsProfile"),
      });
    }
  });

type QuickAddValues = z.infer<typeof schema>;

function emptyValues(salaryUnit: boolean): QuickAddValues {
  return {
    company: undefined as unknown as QuickAddValues["company"],
    role: "",
    platform_id: "",
    application_date: "",
    link_to_job: "",
    work_mode: undefined,
    salary_from: "",
    salary_to: "",
    salary_unit: salaryUnit,
  };
}

/** The company field's error: the id branch's own, else the free-text name's or URL's. */
function companyErrorOf(errors: FieldErrors<QuickAddValues>) {
  const error = errors.company as
    | {
        message?: string;
        name?: { message?: string };
        url?: { message?: string };
      }
    | undefined;
  return error?.message ?? error?.name?.message ?? error?.url?.message;
}

export interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The shell's path: on `/applications` the new application opens in place. */
  activePath: string;
}

/**
 * The FAB's quick add, wired: today's company and platform pickers
 * and `DatePickerInput` in the board's slots, `useApplicationMutate` to
 * create (mode active), then the new application on the phone Pipeline
 * (`/applications?focus=<id>`), on the current cycle. "Start with a CV
 * instead" only with `cvs`. Not autosaved: crossing md loses a half-filled
 * one (PRD 0021 edge case).
 */
export function QuickAddSheet({
  open,
  onOpenChange,
  activePath,
}: QuickAddSheetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { setSelectedCycleId } = useCycleContext();
  const { has: hasCvs } = useHasFeature("cvs");
  const { data: platformOptions, isLoading: platformsLoading } = usePlatforms();
  const { applications } = useApplications(null);
  const { fetchCompanies } = useCompanySearch();
  const createPlatformOutcome = useCreatePlatformOutcome();

  const salaryCurrency = user?.salary_currency;
  const salaryPeriod = user?.salary_period;
  const salaryUnit = Boolean(salaryCurrency && salaryPeriod);

  const [platformChoice, setPlatformChoice] = useState<string | null>(null);
  const [dateChoice, setDateChoice] = useState<QuickAddDate>("today");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  // A new key empties `CompanySelect`, which keeps its own pick.
  const [round, setRound] = useState(0);

  const form = useForm<QuickAddValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(salaryUnit),
  });
  const platformId = useWatch({ control: form.control, name: "platform_id" });
  const pickedDate = useWatch({
    control: form.control,
    name: "application_date",
  });
  const workMode = useWatch({ control: form.control, name: "work_mode" });
  const { errors } = form.formState;

  const chips = useMemo(
    () => platformChips(platformOptions ?? [], applications ?? []),
    [platformOptions, applications],
  );
  // Nothing picked yet: the first chip (the one the user applies through most).
  const choice = platformChoice ?? chips[0]?.id ?? null;

  const {
    submit,
    isPending,
    error: createError,
  } = useApplicationMutate({
    onSuccess: (created) => {
      onOpenChange(false);
      form.reset(emptyValues(salaryUnit));
      setPlatformChoice(null);
      setDateChoice("today");
      setDetailsOpen(false);
      setShowError(false);
      setRound((value) => value + 1);
      // The new application is in the current cycle: look there.
      setSelectedCycleId(null);
      const href = `/applications?focus=${encodeURIComponent(created.id)}`;
      if (activePath === "/applications") {
        // Same route: `router.push` with only a new query is a no-op on this
        // static export; Next keeps `useSearchParams` in sync with the History API.
        window.history.pushState(null, "", href);
      } else {
        router.push(href);
      }
    },
  });

  function dayFor(pick: QuickAddDate, picked: string): string {
    const today = new Date();
    if (pick === "today") return localCalendarDay(today);
    if (pick === "yesterday") return localCalendarDay(addDays(today, -1));
    return picked;
  }

  async function onValid(values: QuickAddValues) {
    const from = salaryAmount(values.salary_from);
    const to = salaryAmount(values.salary_to);
    const withSalary = salaryUnit && (from !== undefined || to !== undefined);
    const payload: CreateApplicationPayload = {
      company: ZodType.parseSchema(values.company),
      platform_id: values.platform_id,
      role: values.role.trim(),
      mode: "active",
      application_date: values.application_date,
      link_to_job: values.link_to_job === "" ? undefined : values.link_to_job,
      work_mode: values.work_mode,
      currency: withSalary ? salaryCurrency : undefined,
      salary_period: withSalary ? salaryPeriod : undefined,
      salary_range_min: withSalary ? from : undefined,
      salary_range_max: withSalary ? to : undefined,
    };
    setShowError(true);
    await submit(payload);
  }

  function onInvalid(invalid: FieldErrors<QuickAddValues>) {
    // A field behind "More details" failed: show it.
    if (invalid.link_to_job || invalid.salary_from || invalid.work_mode) {
      setDetailsOpen(true);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // The chips and the date choice live beside the form: write what they
    // stand for into it, then validate.
    if (choice !== QUICK_ADD_OTHER_PLATFORM) {
      form.setValue("platform_id", choice ?? "");
    }
    if (dateChoice !== "pick") {
      form.setValue("application_date", dayFor(dateChoice, ""));
    }
    form.setValue("salary_unit", salaryUnit);
    return form.handleSubmit(onValid, onInvalid)(event);
  }

  const companyError = companyErrorOf(errors);
  const dateError =
    dateChoice === "pick" ? errors.application_date?.message : undefined;

  return (
    <QuickAddSheetView
      open={open}
      onOpenChange={(next) => {
        if (next) setShowError(false);
        onOpenChange(next);
      }}
      onSubmit={handleSubmit}
      pending={isPending}
      renderCompany={(slot) => (
        <CompanySelect
          key={round}
          id={slot.id}
          placeholder={slot.placeholder}
          form={form}
          fetchCompanies={fetchCompanies}
          aria-invalid={slot.invalid || undefined}
          aria-describedby={slot.describedBy}
          aria-required
        />
      )}
      companyError={companyError}
      roleInput={form.register("role")}
      roleError={errors.role?.message}
      platforms={chips}
      platform={choice}
      onPlatformChange={(value) => {
        setPlatformChoice(value);
        // "Other" starts empty: the picker below the chips fills it.
        form.setValue(
          "platform_id",
          value === QUICK_ADD_OTHER_PLATFORM ? "" : value,
          { shouldValidate: form.formState.isSubmitted },
        );
      }}
      renderOtherPlatform={(slot) => (
        <PlatformSelect
          id={slot.id}
          options={platformOptions}
          isLoading={platformsLoading}
          value={platformId}
          onValueChange={(value) =>
            form.setValue("platform_id", value, { shouldValidate: true })
          }
          onCreate={createPlatformOutcome}
          aria-labelledby={slot.labelledBy}
          aria-describedby={slot.describedBy}
          aria-invalid={slot.invalid || undefined}
          aria-required
        />
      )}
      platformError={errors.platform_id?.message}
      date={dateChoice}
      onDateChange={(value) => {
        setDateChoice(value);
        if (value === "pick") {
          form.setValue("application_date", "");
          form.clearErrors("application_date");
        }
      }}
      renderPickedDate={(slot) => (
        <DatePickerInput
          id={slot.id}
          value={pickedDate || undefined}
          maxDate={new Date()}
          onChange={(value) =>
            form.setValue("application_date", value ?? "", {
              shouldValidate: true,
            })
          }
          aria-labelledby={slot.labelledBy}
          aria-describedby={slot.describedBy}
          aria-invalid={slot.invalid || undefined}
        />
      )}
      dateError={dateError}
      detailsOpen={detailsOpen}
      onDetailsOpenChange={setDetailsOpen}
      linkInput={form.register("link_to_job")}
      linkError={errors.link_to_job?.message}
      workMode={workMode ?? null}
      onWorkModeChange={(value) => form.setValue("work_mode", value)}
      salaryFromInput={form.register("salary_from")}
      salaryToInput={form.register("salary_to")}
      salaryError={errors.salary_from?.message}
      startWithCvHref={hasCvs ? "/applications/new-with-cv" : undefined}
      formError={
        showError && createError
          ? getApiError(createError as AxiosError)
          : undefined
      }
    />
  );
}

/**
 * Up to `QUICK_ADD_PLATFORM_CHIPS` platforms for the chips: the ones the
 * user's current-cycle applications use most, then the rest in the
 * order `usePlatforms` returns them (`GET /platforms` sorts by name).
 */
export function platformChips(
  options: readonly QuickAddPlatform[],
  applications: readonly { platform_id: string }[],
): QuickAddPlatform[] {
  const uses = new Map<string, number>();
  for (const app of applications) {
    uses.set(app.platform_id, (uses.get(app.platform_id) ?? 0) + 1);
  }
  return [...options]
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        (uses.get(b.option.id) ?? 0) - (uses.get(a.option.id) ?? 0) ||
        a.index - b.index,
    )
    .slice(0, QUICK_ADD_PLATFORM_CHIPS)
    .map(({ option }) => ({ id: option.id, name: option.name }));
}
