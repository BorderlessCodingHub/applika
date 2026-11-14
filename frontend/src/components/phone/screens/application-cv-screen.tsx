"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEventHandler,
  type RefObject,
} from "react";
import Link from "next/link";
import { Archive, Loader2, Lock, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import type { CvFormDiffSlots } from "@/components/base-cvs/cv-form-diff";
import {
  CV_FORM_SECTION_IDS,
  type CvFormSectionId,
} from "@/components/base-cvs/cv-form-sections";
import {
  BASE_CVS_MAX,
  skillKeywords,
  type BaseCv,
  type CvFormValues,
} from "@/components/base-cvs/types";
import { clampFit } from "@/components/jobs/job-copy";
import { PhoneBackHref, PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import { PhoneCvSections } from "@/components/phone/phone-cv-sections";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { PhoneAlertCard } from "@/components/phone/phone-state-card";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import { preselectedBaseCvId } from "@/components/tailored-cvs/base-cv-picker";
import {
  cvDiffCountLabel,
  cvDiffSummaryLabel,
} from "@/components/tailored-cvs/cv-diff-summary-bar";
import { CvDiffSectionCount } from "@/components/tailored-cvs/cv-diff-section-count";
import type { CvFitPanelData } from "@/components/tailored-cvs/cv-fit-panel";
import type {
  TailoredCvAdjustment,
  TailoredCvReadOnlyReason,
} from "@/components/tailored-cvs/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const APPLICATIONS_HREF = "/applications";

function defaultEditHref(cv: BaseCv): string {
  return `/cvs/editor?id=${encodeURIComponent(cv.id)}`;
}

function isSectionId(value: string): value is CvFormSectionId {
  return CV_FORM_SECTION_IDS.includes(value as CvFormSectionId);
}

/** The picker's data and handlers: `application-cv-page.tsx`'s own, as `BaseCvPicker` takes them. */
export interface ApplicationCvPickerSlots {
  /** `fromQuery(useBaseCvs())`. */
  masterCvs: PhoneLoad<readonly BaseCv[]>;
  /** The page's `selectedBaseCvId`; an id not in the list selects nothing. */
  selectedId: string | null;
  /** The page's `handleSelect`; called once with a lone master CV (`preselectedBaseCvId`). Stable. */
  onSelect: (baseCvId: string) => void;
  /** The page's create, `{baseCvId, tailoring}` as today. */
  onCreate: () => void;
  creating: boolean;
  tailorByKeywords: boolean;
  /** Given only with the `jobs` feature and a job description (`jobTools`): the Tailor card. */
  onTailorByKeywordsChange?: (checked: boolean) => void;
  /** Called once the sheet confirms; the sheet closes when the CV leaves the list. */
  onDelete: (cv: BaseCv) => void;
  deletingId: string | null;
  onExportPdf: (cv: BaseCv) => void;
  exportingPdfId: string | null;
  onExportMarkdown: (cv: BaseCv) => void;
  exportingMarkdownId: string | null;
  max?: number;
  editHref?: (cv: BaseCv) => string;
  newHref?: string;
}

/** `useApplicationCvFit` as `CvFitPanel` takes it; the page passes `null` for no card. */
export interface ApplicationCvFitSlot {
  data: CvFitPanelData | null | undefined;
  loading: boolean;
  /** A failure other than the 404 (the page passes no card for that). */
  error: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  /** The form holds unsaved edits: the score is of the saved copy. */
  dirty: boolean;
}

/** The Changes card: `useCvDiff` and the two diff downloads. */
export interface ApplicationCvChangesSlot {
  /** `null` while the baseline did not resolve (`diffUnresolved`): the downloads alone, refused with `disabledReason`. */
  baseline: {
    /** The master CV's current name, or `null` ("the original master CV"). */
    label: string | null;
    /** `useCvDiff().diffResult.total`. */
    count: number;
    showChanges: boolean;
    onShowChangesChange: (next: boolean) => void;
  } | null;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  exportingPdf: boolean;
  exportingMarkdown: boolean;
  /** A 409's words or `diffUnresolved`: both downloads refused, the reason under them. */
  disabledReason: string | null;
}

/** The copy's editor: the page's form, mutations and derived state. */
export interface ApplicationCvEditorSlots {
  /** The page's form (`tailoredCvSchema`), seeded once per copy. */
  form: UseFormReturn<CvFormValues>;
  /** `form.handleSubmit(update, onInvalid)`: "Save CV copy" submits it. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  saving: boolean;
  /** `cv.base_cv_id === null`. */
  sourceDeleted: boolean;
  sourceCvName: string | null;
  jobDescription: string | null | undefined;
  /** Opens today's `ApplicationFormSheet`; shown only on an editable copy with no job description. */
  onAddJobDescription?: () => void;
  fit: ApplicationCvFitSlot | null;
  changes: ApplicationCvChangesSlot | null;
  /** `useCvDiff().slots`: markers while "Show changes" is on. */
  diff?: CvFormDiffSlots;
  /** `useCvDiff().diffResult?.sections`: each row's change count while "Show changes" is on. */
  sectionChanges?: Readonly<Partial<Record<CvFormSectionId, number>>>;
  /** `cv.adjustments`: each named section's row says "Reordered", Show changes on or off. */
  adjustments: readonly TailoredCvAdjustment[];
  onExportPdf: () => void;
  exportingPdf: boolean;
  onExportMarkdown: () => void;
  exportingMarkdown: boolean;
  onDelete: () => void;
  deleting: boolean;
  newItemId?: () => string;
}

export interface ApplicationCvScreenViewProps {
  /** `useHasFeature("cvs").stage === "beta"`: the top bar's "Beta" pill. */
  beta: boolean;
  /** `?id=`; `null` is today's "No application selected". */
  applicationId: string | null;
  applicationLoading: boolean;
  /** The application read out of the viewed cycle; its role and company lead the page. */
  application: { role: string; company_name: string } | null | undefined;
  /** `getApiError(applicationError)`; `null` with no application is "not in this cycle". */
  applicationError: string | null;
  readOnlyReason: TailoredCvReadOnlyReason | null;
  /** The page's `noCopyYet` (a 404, or deleted in this session). */
  noCopyYet: boolean;
  /** A copy load failure other than the 404, as `getApiError` words. */
  copyError: string | null;
  /** `cvLoading || !cv`. */
  copyLoading: boolean;
  picker: ApplicationCvPickerSlots;
  /** `null` until the copy is read. */
  editor: ApplicationCvEditorSlots | null;
}

type Stage =
  | "no-id"
  | "loading-application"
  | "open-error"
  | "locked"
  | "picker"
  | "copy-error"
  | "loading-copy"
  | "editor";

/** v3/ApplicationCV below md: props in, the board out. */
export function ApplicationCvScreenView({
  beta,
  applicationId,
  applicationLoading,
  application,
  applicationError,
  readOnlyReason,
  noCopyYet,
  copyError,
  copyLoading,
  picker,
  editor,
}: ApplicationCvScreenViewProps) {
  const t = useTranslations("cvs.applicationCv");
  const tFeatures = useTranslations("features");
  const tExport = useTranslations("cvs.export");
  const tDownload = useTranslations("cvs.diff.download");
  const tEditor = useTranslations("cvs.tailored.editor");
  const tPhone = useTranslations("phone.cvs");
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmCopyDelete, setConfirmCopyDelete] = useState(false);

  // The same order as the page's desktop `renderBody`.
  const stage: Stage = !applicationId
    ? "no-id"
    : applicationLoading
      ? "loading-application"
      : !application
        ? "open-error"
        : noCopyYet
          ? readOnlyReason
            ? "locked"
            : "picker"
          : copyError
            ? "copy-error"
            : copyLoading || !editor
              ? "loading-copy"
              : "editor";

  // A deleted copy puts the picker back: the sheet goes with the editor.
  if (confirmCopyDelete && stage !== "editor") setConfirmCopyDelete(false);

  const hasChoices =
    picker.masterCvs.status === "ready" && picker.masterCvs.data.length > 0;
  const hasBar =
    (stage === "picker" && hasChoices) ||
    (stage === "editor" && !readOnlyReason);

  const pending =
    stage === "picker"
      ? picker.exportingPdfId
        ? tExport("pdfPending")
        : picker.exportingMarkdownId
          ? tExport("markdownPending")
          : ""
      : stage === "editor" && editor
        ? editor.exportingPdf
          ? tExport("pdfPending")
          : editor.exportingMarkdown
            ? tExport("markdownPending")
            : editor.changes?.exportingPdf || editor.changes?.exportingMarkdown
              ? tDownload("pending")
              : ""
        : "";

  let body;
  switch (stage) {
    case "no-id":
      body = (
        <PageMessage
          reason="no-id"
          title={t("noIdTitle")}
          body={t("noIdBody")}
        />
      );
      break;
    case "loading-application":
      body = (
        <PhoneSkeleton label={t("loadingApplication")}>
          <PhoneSkeletonCard className="h-[150px]" />
          <PhoneSkeletonCard className="h-[420px]" />
        </PhoneSkeleton>
      );
      break;
    case "open-error":
      body = (
        <PageMessage
          alert
          reason="open-error"
          title={t("openErrorTitle")}
          body={applicationError ?? t("notInCycle")}
        />
      );
      break;
    case "locked":
      body = <LockedPicker reason={readOnlyReason ?? "finalized"} />;
      break;
    case "picker":
      body = <Picker {...picker} />;
      break;
    case "copy-error":
      body = (
        <PageMessage
          alert
          reason="copy-error"
          title={t("loadErrorTitle")}
          body={copyError ?? ""}
        />
      );
      break;
    case "loading-copy":
      body = (
        <PhoneSkeleton label={t("loadingCopy")}>
          <PhoneSkeletonCard className="h-6 w-44 rounded-full" />
          <PhoneSkeletonCard className="h-[150px]" />
          <PhoneSkeletonCard className="h-[540px]" />
        </PhoneSkeleton>
      );
      break;
    case "editor":
      body = editor ? (
        <Editor
          {...editor}
          readOnlyReason={readOnlyReason}
          onAskDelete={() => setConfirmCopyDelete(true)}
        />
      ) : null;
      break;
  }

  return (
    <div
      data-slot="phone-application-cv"
      data-state={stage}
      className={cn("ph-app ph-ce ph-acv", !hasBar && "ph-ce-nobar")}
    >
      {applicationId ? (
        <PhoneBackHref
          href={`${APPLICATIONS_HREF}?focus=${encodeURIComponent(applicationId)}`}
        />
      ) : null}
      {beta ? (
        <PhoneTopBarEnd>
          <PhonePill>{tFeatures("beta")}</PhonePill>
        </PhoneTopBarEnd>
      ) : null}

      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="ph-h1 ph-h1-26 ph-focus-target"
        >
          {t("title")}
        </h1>
        <p className="ph-lead">
          {application
            ? `${application.role} · ${application.company_name}`
            : t("description")}
        </p>
      </div>

      {/* Empty but mounted: a region inserted with its words may not announce. */}
      <p className="ph-sr" aria-live="polite" aria-atomic="true">
        {pending}
      </p>

      {body}

      <PhoneConfirmSheet
        open={confirmCopyDelete && stage === "editor"}
        onOpenChange={(open) => {
          if (!open && !editor?.deleting) setConfirmCopyDelete(false);
        }}
        title={tEditor("deleteTitle")}
        description={tEditor("deleteDescription")}
        cancelLabel={tEditor("cancel")}
        confirmLabel={tEditor("deleteConfirm")}
        pendingLabel={tPhone("deleting")}
        pending={editor?.deleting ?? false}
        confirmAction="confirm-delete-cv-copy"
        fallbackFocus={heading}
        onConfirm={() => editor?.onDelete()}
      />
    </div>
  );
}

function PageMessage({
  reason,
  title,
  body,
  alert = false,
}: {
  reason: "no-id" | "open-error" | "copy-error";
  title: string;
  body: string;
  /** Only for something that went wrong, never for a static state (today's rule). */
  alert?: boolean;
}) {
  const t = useTranslations("cvs.applicationCv");
  return (
    <div
      role={alert ? "alert" : undefined}
      data-slot="application-cv-message"
      data-reason={reason}
      className="ph-card ph-ce-message"
    >
      <p className="ph-ce-message-h">{title}</p>
      <p className="ph-hint">{body}</p>
      <Link
        href={APPLICATIONS_HREF}
        data-action="back-to-applications"
        className="ph-btn ph-sm ph-sec"
      >
        {t("back")}
      </Link>
    </div>
  );
}

function ReadOnlyBanner({ reason }: { reason: TailoredCvReadOnlyReason }) {
  const t = useTranslations("cvs.tailored.readOnly");
  const Icon = reason === "finalized" ? Lock : Archive;
  return (
    <div
      role="status"
      data-slot="cv-copy-read-only"
      data-reason={reason}
      className="ph-acv-banner"
    >
      <Icon size={18} aria-hidden="true" className="ph-acv-banner-ic" />
      <div className="ph-acv-banner-text">
        <p className="ph-acv-banner-t">{t(`${reason}.title`)}</p>
        <p className="ph-acv-banner-b">{t(`${reason}.body`)}</p>
      </div>
    </div>
  );
}

/** A closed or archived application with no copy: the banner and today's words, nothing to choose. */
function LockedPicker({ reason }: { reason: TailoredCvReadOnlyReason }) {
  const t = useTranslations("cvs.tailored.picker");
  return (
    <>
      <ReadOnlyBanner reason={reason} />
      <p data-slot="cv-copy-locked" className="ph-acv-locked">
        {t("lockedBody")}
      </p>
    </>
  );
}

function Picker({
  masterCvs,
  selectedId,
  onSelect,
  onCreate,
  creating,
  tailorByKeywords,
  onTailorByKeywordsChange,
  onDelete,
  deletingId,
  onExportPdf,
  exportingPdfId,
  onExportMarkdown,
  exportingMarkdownId,
  max = BASE_CVS_MAX,
  editHref = defaultEditHref,
  newHref = "/cvs/new",
}: ApplicationCvPickerSlots) {
  const t = useTranslations("cvs");
  const tPicker = useTranslations("cvs.tailored.picker");
  const tPhone = useTranslations("phone.cvs");
  const base = useId();
  const headingId = `${base}-h`;
  const hintId = `${base}-hint`;
  const heading = useRef<HTMLHeadingElement>(null);

  const options = masterCvs.status === "ready" ? masterCvs.data : undefined;
  // A deleted master CV must not stay selected: Create would send an id the server no longer has.
  const selected =
    selectedId && options?.some((cv) => cv.id === selectedId)
      ? selectedId
      : null;
  const preselect = preselectedBaseCvId(options);
  useEffect(() => {
    if (preselect && !selected) onSelect(preselect);
  }, [preselect, selected, onSelect]);

  const [deleteTarget, setDeleteTarget] = useState<BaseCv | null>(null);
  // The sheet's words outlive the target while it closes.
  const [shownTarget, setShownTarget] = useState<BaseCv | null>(null);
  if (deleteTarget !== null && deleteTarget !== shownTarget) {
    setShownTarget(deleteTarget);
  }
  // Deleted: the CV left the list. A failure toasts and keeps the sheet for Cancel.
  if (
    deleteTarget &&
    options &&
    !options.some((cv) => cv.id === deleteTarget.id)
  ) {
    setDeleteTarget(null);
  }
  const deletePending = deleteTarget !== null && deletingId === deleteTarget.id;

  const createBlocked = !selected || deletingId === selected;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="cv-copy-picker"
      className="ph-acv-pick"
    >
      <div>
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="ph-h2 ph-focus-target"
        >
          {tPicker("title")}
        </h2>
        <p id={hintId} className="ph-hint ph-acv-hint">
          {tPicker("hint")}
        </p>
      </div>

      <PhoneLoadable
        state={masterCvs}
        className="ph-acv-pick-body"
        loading={
          <PhoneSkeleton label={t("list.loading")}>
            <PhoneSkeletonCard className="h-[230px]" />
            <PhoneSkeletonCard className="h-[230px]" />
          </PhoneSkeleton>
        }
        error={(failure) => (
          <PhoneAlertCard
            data-slot="cv-list-error"
            title={t("list.errorTitle")}
            body={failure.message}
            retryLabel={t("list.retry")}
            onRetry={failure.onRetry}
            retrying={failure.retrying}
          />
        )}
      >
        {(list) => {
          const remaining = Math.max(0, max - list.length);
          return (
            <>
              {list.length === 0 ? (
                <div data-slot="cvs-empty" className="ph-card ph-cv-empty">
                  <p className="ph-cv-name">{t("list.emptyTitle")}</p>
                  <p className="ph-hint">{t("list.emptyBody")}</p>
                </div>
              ) : (
                <div
                  role="group"
                  aria-labelledby={headingId}
                  aria-describedby={hintId}
                  data-slot="cv-choices"
                  className="ph-acv-group"
                >
                  {list.map((cv) => (
                    <Choice
                      key={cv.id}
                      cv={cv}
                      name={`${base}-cv`}
                      checked={cv.id === selected}
                      locked={creating}
                      onSelect={onSelect}
                      editHref={editHref(cv)}
                      onExportPdf={() => onExportPdf(cv)}
                      exportingPdf={exportingPdfId === cv.id}
                      onExportMarkdown={() => onExportMarkdown(cv)}
                      exportingMarkdown={exportingMarkdownId === cv.id}
                      onDelete={() => setDeleteTarget(cv)}
                      deleting={deletingId === cv.id}
                    />
                  ))}
                </div>
              )}
              {remaining > 0 ? (
                <Link
                  href={newHref}
                  data-slot="cv-new-tile"
                  data-action="new-cv"
                  className="ph-cv-new ph-acv-new"
                >
                  <Plus
                    size={20}
                    strokeWidth={2.25}
                    aria-hidden="true"
                    className="ph-cv-new-ic"
                  />
                  <span className="ph-cv-new-t">{t("new.title")}</span>
                  <span className="ph-cv-new-s">
                    {t("new.slotsLeft", { remaining, max })}
                  </span>
                </Link>
              ) : (
                <p data-slot="cvs-limit" className="ph-hint ph-cv-limit">
                  {t("new.limitReason")}
                </p>
              )}
              {list.length > 0 && onTailorByKeywordsChange ? (
                <TailorCard
                  checked={tailorByKeywords}
                  onCheckedChange={onTailorByKeywordsChange}
                  locked={creating}
                />
              ) : null}
              {list.length > 0 ? (
                <PhoneActionBar>
                  <button
                    type="button"
                    data-action="create-cv-copy"
                    aria-disabled={createBlocked || creating || undefined}
                    aria-busy={creating || undefined}
                    data-disabled={creating || undefined}
                    className="ph-btn ph-pri ph-dr-go-btn"
                    onClick={() => {
                      if (!createBlocked && !creating) onCreate();
                    }}
                  >
                    {creating ? (
                      <Loader2
                        size={16}
                        aria-hidden="true"
                        className="ph-spin"
                      />
                    ) : null}
                    {tPicker("create")}
                  </button>
                </PhoneActionBar>
              ) : null}
            </>
          );
        }}
      </PhoneLoadable>

      <PhoneConfirmSheet
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteTarget(null);
        }}
        title={t("card.deleteTitle")}
        description={t("card.deleteDescription", {
          name: shownTarget?.name ?? "",
        })}
        cancelLabel={t("card.cancel")}
        confirmLabel={t("card.delete")}
        pendingLabel={tPhone("deleting")}
        pending={deletePending}
        confirmAction="confirm-delete-cv"
        fallbackFocus={heading}
        onConfirm={() => {
          if (deleteTarget && !deletePending) onDelete(deleteTarget);
        }}
      />
    </section>
  );
}

function Choice({
  cv,
  name,
  checked,
  locked,
  onSelect,
  editHref,
  onExportPdf,
  exportingPdf,
  onExportMarkdown,
  exportingMarkdown,
  onDelete,
  deleting,
}: {
  cv: BaseCv;
  /** The group's one radio name (`useId`). */
  name: string;
  checked: boolean;
  /** The copy is being created: every control keeps focus and ignores taps. */
  locked: boolean;
  onSelect: (baseCvId: string) => void;
  editHref: string;
  onExportPdf: () => void;
  exportingPdf: boolean;
  onExportMarkdown: () => void;
  exportingMarkdown: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("cvs.card");
  const tFormat = useTranslations("cvs.diff.download");
  const tPhone = useTranslations("phone.applicationCv");
  const format = useFormatter();
  const base = useId();
  const nameId = `${base}-name`;
  const updatedId = `${base}-updated`;
  const whoId = `${base}-who`;
  const keywords = skillKeywords(cv.skills);
  const updatedAt = cv.updated_at ? new Date(cv.updated_at) : null;
  const updated =
    updatedAt && !Number.isNaN(updatedAt.getTime())
      ? format.dateTime(updatedAt, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
  const who = [cv.full_name?.trim(), cv.headline?.trim()]
    .filter(Boolean)
    .join(" · ");
  const describedBy = [updated ? updatedId : null, who ? whoId : null]
    .filter(Boolean)
    .join(" ");
  const pdfBusy = exportingPdf;
  const markdownBusy = exportingMarkdown;

  return (
    <div
      data-slot="cv-choice"
      data-cv-id={cv.id}
      data-checked={checked || undefined}
      data-deleting={deleting || undefined}
      className={cn("ph-pick ph-acv-choice", checked && "ph-on")}
    >
      <label className="ph-acv-opt">
        <input
          type="radio"
          name={name}
          value={cv.id}
          checked={checked}
          aria-labelledby={nameId}
          aria-describedby={describedBy || undefined}
          aria-disabled={locked || undefined}
          className="ph-sr"
          onChange={() => {
            if (!locked) onSelect(cv.id);
          }}
        />
        <span className="ph-radio" aria-hidden="true" />
        <span className="ph-acv-opt-text">
          <span id={nameId} className="ph-acv-name">
            {cv.name}
          </span>
          {updated ? (
            <span id={updatedId} className="ph-acv-upd">
              {t("updated", { date: updated })}
            </span>
          ) : null}
          {who ? (
            <span id={whoId} className="ph-acv-who">
              {who}
            </span>
          ) : null}
        </span>
      </label>
      {keywords.length > 0 ? (
        <ul className="ph-cv-tags">
          {keywords.map((keyword) => (
            <li key={keyword} className="ph-jb-tag-li">
              <span className="ph-tag ph-cv-tag">{keyword}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ph-hint">{t("noSkills")}</p>
      )}
      <p className="ph-mono ph-cv-counts">
        {[
          t("roles", { count: cv.experience.length }),
          t("projects", { count: cv.projects.length }),
          t("languages", { count: cv.languages.length }),
          t("keywords", { count: keywords.length }),
        ].join(" · ")}
      </p>
      <div className="ph-acv-acts">
        <button
          type="button"
          data-action="download-cv-pdf"
          aria-label={tPhone("pdfOf", { name: cv.name })}
          aria-disabled={locked || pdfBusy || undefined}
          aria-busy={pdfBusy || undefined}
          data-disabled={pdfBusy || undefined}
          className="ph-btn ph-sm ph-sec ph-acv-act"
          onClick={() => {
            if (!locked && !pdfBusy) onExportPdf();
          }}
        >
          {pdfBusy ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tFormat("pdf")}
        </button>
        <button
          type="button"
          data-action="download-cv-markdown"
          aria-label={tPhone("markdownOf", { name: cv.name })}
          aria-disabled={locked || markdownBusy || undefined}
          aria-busy={markdownBusy || undefined}
          data-disabled={markdownBusy || undefined}
          className="ph-btn ph-sm ph-sec ph-acv-act"
          onClick={() => {
            if (!locked && !markdownBusy) onExportMarkdown();
          }}
        >
          {markdownBusy ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tFormat("markdown")}
        </button>
        <Link
          href={editHref}
          data-action="edit-cv"
          aria-label={t("editLabel", { name: cv.name })}
          className="ph-btn ph-sm ph-sec ph-acv-act"
        >
          {t("edit")}
        </Link>
        <button
          type="button"
          data-action="delete-cv"
          aria-haspopup="dialog"
          aria-label={t("deleteLabel", { name: cv.name })}
          aria-disabled={locked || deleting || undefined}
          data-disabled={deleting || undefined}
          className="ph-btn ph-sm ph-dan ph-acv-del"
          onClick={() => {
            if (!locked && !deleting) onDelete();
          }}
        >
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

function TailorCard({
  checked,
  onCheckedChange,
  locked,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  locked: boolean;
}) {
  const t = useTranslations("cvs.tailored.tailorByKeywords");
  const base = useId();
  const switchId = `${base}-switch`;
  const hintId = `${base}-hint`;
  return (
    <div
      data-slot="tailor-by-keywords"
      data-state={checked ? "on" : "off"}
      className="ph-card ph-acv-tailor"
    >
      <div className="ph-acv-tailor-text">
        <label htmlFor={switchId} className="ph-acv-tailor-t">
          {t("label")}
        </label>
        <p id={hintId} className="ph-hint ph-acv-hint">
          {t("description")}
        </p>
      </div>
      <PhoneSwitch
        id={switchId}
        checked={checked}
        aria-describedby={hintId}
        aria-disabled={locked || undefined}
        onCheckedChange={(next) => {
          if (!locked) onCheckedChange(next);
        }}
      />
    </div>
  );
}

function Editor({
  form,
  onSubmit,
  saving,
  sourceDeleted,
  sourceCvName,
  jobDescription,
  onAddJobDescription,
  fit,
  changes,
  diff,
  sectionChanges,
  adjustments,
  onExportPdf,
  exportingPdf,
  onExportMarkdown,
  exportingMarkdown,
  deleting,
  newItemId,
  readOnlyReason,
  onAskDelete,
}: ApplicationCvEditorSlots & {
  readOnlyReason: TailoredCvReadOnlyReason | null;
  onAskDelete: () => void;
}) {
  const tSource = useTranslations("cvs.tailored.source");
  const tEditor = useTranslations("cvs.tailored.editor");
  const tExport = useTranslations("cvs.export");
  const readOnly = Boolean(readOnlyReason);
  const locked = saving || deleting;

  const reordered = useMemo(
    () =>
      new Set(
        adjustments.map((entry) => entry.section).filter(isSectionId),
      ) as ReadonlySet<CvFormSectionId>,
    [adjustments],
  );

  // "Reordered" is the row's own word (`reordered`): the status says the count alone.
  const rowDiff = useMemo<CvFormDiffSlots | undefined>(() => {
    if (!diff) return undefined;
    return {
      ...diff,
      sectionStatus: (section) => {
        const count = sectionChanges?.[section] ?? 0;
        return count > 0 ? <CvDiffSectionCount count={count} /> : undefined;
      },
    };
  }, [diff, sectionChanges]);

  return (
    <form
      noValidate
      data-slot="cv-copy-editor"
      data-read-only={readOnly || undefined}
      className="ph-acv-form"
      onSubmit={(event) => {
        if (readOnly || locked) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      {readOnlyReason ? <ReadOnlyBanner reason={readOnlyReason} /> : null}

      <div
        data-slot="cv-copy-source"
        data-deleted={sourceDeleted || undefined}
        className="ph-acv-src"
      >
        <PhonePill tone={sourceDeleted ? "warn" : "pri"}>
          {sourceDeleted
            ? tSource("deleted")
            : sourceCvName
              ? tSource("copiedFrom", { name: sourceCvName })
              : tSource("copiedFromMaster")}
        </PhonePill>
        {/* Said next to the pill, so "source CV deleted" does not read as data loss. */}
        {sourceDeleted ? (
          <p className="ph-hint">{tSource("deletedHint")}</p>
        ) : null}
      </div>

      <JobDescriptionCard
        text={(jobDescription ?? "").trim()}
        onAdd={readOnly ? undefined : onAddJobDescription}
      />

      {fit ? <FitCard {...fit} /> : null}

      {changes ? <ChangesCard {...changes} adjustments={adjustments} /> : null}

      <PhoneCvSections
        form={form}
        disabled={readOnly || locked}
        newItemId={newItemId}
        firstOpen={null}
        diff={rowDiff}
        reordered={reordered}
      />

      <div data-slot="cv-copy-downloads" className="ph-acv-foot">
        <button
          type="button"
          data-action="download-pdf"
          aria-disabled={exportingPdf || undefined}
          aria-busy={exportingPdf || undefined}
          data-disabled={exportingPdf || undefined}
          className="ph-btn ph-sm ph-sec ph-acv-grow"
          onClick={() => {
            if (!exportingPdf) onExportPdf();
          }}
        >
          {exportingPdf ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tExport("pdfLabel")}
        </button>
        <button
          type="button"
          data-action="download-markdown"
          aria-disabled={exportingMarkdown || undefined}
          aria-busy={exportingMarkdown || undefined}
          data-disabled={exportingMarkdown || undefined}
          className="ph-btn ph-sm ph-sec ph-acv-grow"
          onClick={() => {
            if (!exportingMarkdown) onExportMarkdown();
          }}
        >
          {exportingMarkdown ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tExport("markdownLabel")}
        </button>
        {readOnly ? null : (
          <button
            type="button"
            data-action="delete-cv-copy"
            aria-haspopup="dialog"
            aria-disabled={locked || undefined}
            data-disabled={deleting || undefined}
            className="ph-btn ph-sm ph-dan ph-acv-full"
            onClick={() => {
              if (!locked) onAskDelete();
            }}
          >
            {tEditor("deleteAction")}
          </button>
        )}
      </div>

      {readOnly ? null : (
        <PhoneActionBar>
          <button
            type="submit"
            data-action="save-cv-copy"
            aria-disabled={locked || undefined}
            aria-busy={saving || undefined}
            data-disabled={locked || undefined}
            className="ph-btn ph-pri ph-dr-go-btn"
          >
            {saving ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {tEditor("submit")}
          </button>
        </PhoneActionBar>
      )}
    </form>
  );
}

function JobDescriptionCard({
  text,
  onAdd,
}: {
  text: string;
  /** Absent on a read-only copy: no way to add one there. */
  onAdd?: () => void;
}) {
  const t = useTranslations("cvs.tailored.jobDescription");
  const tPhone = useTranslations("phone.applicationCv");
  const base = useId();
  const headingId = `${base}-h`;
  const textId = `${base}-text`;
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const overflowing = useClampOverflow(textRef, text, expanded);

  return (
    <section
      aria-labelledby={headingId}
      data-slot="cv-copy-job-description"
      className="ph-card ph-acv-jd"
    >
      <h2 id={headingId} className="ph-acv-h2">
        {t("title")}
      </h2>
      <p className="ph-hint">{t("description")}</p>
      {text ? (
        <>
          <p
            ref={textRef}
            id={textId}
            data-expanded={expanded || undefined}
            className={cn("ph-acv-jd-text", !expanded && "ph-acv-clamp")}
          >
            {text}
          </p>
          {expanded || overflowing ? (
            <button
              type="button"
              data-action="toggle-job-description"
              aria-expanded={expanded}
              aria-controls={textId}
              className="ph-acv-more"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? tPhone("showLess") : tPhone("showMore")}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="ph-hint">{t("emptyHint")}</p>
          {onAdd ? (
            <button
              type="button"
              data-action="add-job-description"
              aria-haspopup="dialog"
              className="ph-btn ph-sm ph-sec ph-acv-add"
              onClick={onAdd}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t("add")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Whether the clamped text holds more than its four lines (measured, so a short one gets no "Show more"). */
function useClampOverflow(
  ref: RefObject<HTMLElement | null>,
  text: string,
  expanded: boolean,
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    const measure = () =>
      setOverflowing(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, text, expanded]);
  return overflowing;
}

function FitCard({
  data,
  loading,
  error,
  onRetry,
  retrying = false,
  dirty,
}: ApplicationCvFitSlot) {
  const t = useTranslations("cvs.fit");
  const tJobs = useTranslations("jobs");
  const base = useId();
  const headingId = `${base}-h`;
  const region = useRef<HTMLElement>(null);
  const retried = useRef(false);

  const state = loading
    ? "loading"
    : error
      ? "error"
      : data && data.score !== null
        ? "ready"
        : null;

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state === "error" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    region.current?.focus({ preventScroll: true });
  }, [state]);

  if (state === null) return null;
  const score =
    state === "ready" && data?.score != null ? clampFit(data.score) : null;

  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-labelledby={headingId}
      aria-busy={state === "loading" || undefined}
      data-slot="cv-fit-panel"
      data-state={state}
      data-score={score ?? undefined}
      className="ph-card ph-acv-fit"
    >
      <div className="ph-acv-fit-head">
        <h2 id={headingId} className="ph-acv-h2">
          {t("title")}
        </h2>
        {score !== null ? (
          <span
            data-slot="fit-badge"
            data-score={score}
            className="ph-pill ph-pri ph-mono ph-acv-fit-pill"
          >
            <span className="truncate">{tJobs("fitLabel", { score })}</span>
          </span>
        ) : state === "loading" ? (
          <Skeleton aria-hidden className="h-6 w-[72px] rounded-full" />
        ) : null}
      </div>
      <p className="ph-hint">{t("description")}</p>
      {state === "loading" ? (
        // No role="status": the read-only banner is the screen's one status.
        <>
          <span className="ph-sr">{t("loading")}</span>
          {[0, 1].map((row) => (
            <div key={row} aria-hidden="true" className="flex flex-col gap-2.5">
              <Skeleton className="mt-1 h-4 w-20" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-[26px] w-16 rounded-lg" />
                <Skeleton className="h-[26px] w-24 rounded-lg" />
                <Skeleton className="h-[26px] w-14 rounded-lg" />
              </div>
            </div>
          ))}
        </>
      ) : state === "error" ? (
        <div role="alert" data-slot="cv-fit-error" className="ph-acv-fit-err">
          <p className="ph-acv-fit-err-t">{t("loadError")}</p>
          {onRetry ? (
            // aria-disabled, never disabled: a disabled button drops focus to <body>.
            <button
              type="button"
              data-action="retry-fit"
              aria-disabled={retrying || undefined}
              aria-busy={retrying || undefined}
              className="ph-btn ph-sm ph-sec"
              onClick={() => {
                if (retrying) return;
                retried.current = true;
                onRetry();
              }}
            >
              {retrying ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : data ? (
        <>
          <KeywordGroup kind="matched" keywords={data.matched_keywords} />
          <KeywordGroup kind="missing" keywords={data.missing_keywords} />
          {dirty ? (
            <p data-slot="cv-fit-dirty" className="ph-hint">
              {t("dirty")}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function KeywordGroup({
  kind,
  keywords,
}: {
  kind: "matched" | "missing";
  keywords: readonly string[];
}) {
  const t = useTranslations("jobs");
  const labelId = useId();
  return (
    <>
      <p id={labelId} className="ph-acv-kw-h">
        {t(kind)}
      </p>
      {keywords.length > 0 ? (
        <ul
          aria-labelledby={labelId}
          data-slot="fit-keyword-group"
          data-kind={kind}
          className="ph-cv-tags"
        >
          {keywords.map((keyword, index) => (
            <li key={`${keyword}-${index}`} className="ph-jb-tag-li">
              <span
                className={cn(
                  "ph-tag ph-cv-tag",
                  kind === "missing" && "ph-miss",
                )}
              >
                {keyword}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p data-slot="fit-keyword-group" data-kind={kind} className="ph-hint">
          {t(kind === "matched" ? "noneMatched" : "noneMissing")}
        </p>
      )}
    </>
  );
}

function ChangesCard({
  baseline,
  onExportPdf,
  onExportMarkdown,
  exportingPdf,
  exportingMarkdown,
  disabledReason,
  adjustments,
}: ApplicationCvChangesSlot & {
  adjustments: readonly TailoredCvAdjustment[];
}) {
  const t = useTranslations("phone.applicationCv");
  const tDiff = useTranslations("cvs.diff");
  const tDownload = useTranslations("cvs.diff.download");
  const tSections = useTranslations("cvs.sections");
  const base = useId();
  const switchId = `${base}-switch`;
  const comparedId = `${base}-compared`;
  const movesId = `${base}-moves`;
  const reasonId = `${base}-reason`;
  const refused = Boolean(disabledReason);
  const busy = exportingPdf || exportingMarkdown;
  const blocked = refused || busy;
  const showMoves = Boolean(baseline?.showChanges) && adjustments.length > 0;

  return (
    <section
      aria-label={t("changes")}
      data-slot="cv-copy-changes"
      className="ph-card ph-acv-chg"
    >
      {baseline ? (
        <>
          <div className="ph-acv-row">
            <label htmlFor={switchId} className="ph-acv-chg-l">
              {tDiff("showChanges")}
            </label>
            <PhoneSwitch
              id={switchId}
              checked={baseline.showChanges}
              aria-describedby={comparedId}
              onCheckedChange={baseline.onShowChangesChange}
            />
          </div>
          <ComparedLine
            id={comparedId}
            label={baseline.label}
            count={baseline.count}
          />
          {showMoves ? (
            <div data-slot="cv-diff-adjustments" className="ph-hint">
              <span id={movesId}>{tDiff("reorderedTitle")}</span>:{" "}
              <ul aria-labelledby={movesId} className="ph-acv-moves">
                {adjustments.map((entry, index) => (
                  <li
                    key={`${entry.section}-${index}`}
                    data-section={entry.section}
                  >
                    {isSectionId(entry.section)
                      ? tSections(`${entry.section}.title`)
                      : entry.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      <div data-slot="cv-diff-download" className="ph-acv-dl">
        <span className="ph-acv-dl-l">{tDownload("label")}</span>
        <button
          type="button"
          data-action="download-changes-pdf"
          aria-label={tDownload("as", {
            label: tDownload("label"),
            format: tDownload("pdf"),
          })}
          aria-describedby={refused ? reasonId : undefined}
          aria-disabled={blocked || undefined}
          aria-busy={exportingPdf || undefined}
          data-disabled={busy || undefined}
          className="ph-btn ph-sm ph-sec"
          onClick={() => {
            if (!blocked) onExportPdf();
          }}
        >
          {exportingPdf ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tDownload("pdf")}
        </button>
        <button
          type="button"
          data-action="download-changes-markdown"
          aria-label={tDownload("as", {
            label: tDownload("label"),
            format: tDownload("markdown"),
          })}
          aria-describedby={refused ? reasonId : undefined}
          aria-disabled={blocked || undefined}
          aria-busy={exportingMarkdown || undefined}
          data-disabled={busy || undefined}
          className="ph-btn ph-sm ph-sec"
          onClick={() => {
            if (!blocked) onExportMarkdown();
          }}
        >
          {exportingMarkdown ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {tDownload("markdown")}
        </button>
      </div>
      {disabledReason ? (
        <p
          id={reasonId}
          data-slot="cv-diff-download-reason"
          className="ph-hint"
        >
          {disabledReason}
        </p>
      ) : null}
      <p className="ph-hint">{tDownload("dirtyNotice")}</p>
    </section>
  );
}

/** "Compared with {label}: <mono>N changes</mono>": today's sentence, its count set in mono. */
function ComparedLine({
  id,
  label,
  count,
}: {
  id: string;
  label: string | null;
  count: number;
}) {
  // Subscribes: the sentence is read through the module translator.
  useTranslations("cvs.diff");
  const sentence = cvDiffSummaryLabel(label, count);
  const countText = cvDiffCountLabel(count);
  const at = sentence.lastIndexOf(countText);
  return (
    <p id={id} className="ph-acv-cmp">
      {at < 0 ? (
        sentence
      ) : (
        <>
          {sentence.slice(0, at)}
          <span className="ph-mono">{countText}</span>
          {sentence.slice(at + countText.length)}
        </>
      )}
    </p>
  );
}
