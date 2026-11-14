"use client";

import { useId, type FormEventHandler } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { CvDocumentPreview } from "@/components/base-cvs/cv-document-preview";
import { useCvPreviewData } from "@/components/base-cvs/cv-form-sections";
import type { CvFormValues } from "@/components/base-cvs/types";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { PhoneCvSections } from "@/components/phone/phone-cv-sections";
import {
  PhoneSkeleton,
  PhoneSkeletonCard,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";

export interface CvNewScreenViewProps {
  /** `useHasFeature("cvs").stage === "beta"`: the bar's "Beta" pill. */
  beta: boolean;
  /** `useBaseCvs().isLoading`: no form and no limit card until the count is known. */
  countLoading: boolean;
  /** `(cvs?.length ?? 0) >= BASE_CVS_MAX`: the limit card, no form, no bar. */
  atLimit: boolean;
  /** The page's form (`baseCvSchema`, `emptyBaseCvValues()`); the preview watches it. */
  form: UseFormReturn<CvFormValues>;
  /** `form.handleSubmit(create, onInvalid)`: "Create CV" submits it. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** `useCreateBaseCv().isPending`: Create CV spins and ignores taps, Cancel and every field lock. */
  creating: boolean;
  /** Where Cancel and "Back to CVs" go. */
  cancelHref?: string;
  newItemId?: () => string;
}

/** v3/CVNew below md: props in, the board out. */
export function CvNewScreenView({
  beta,
  countLoading,
  atLimit,
  form,
  onSubmit,
  creating,
  cancelHref = "/cvs",
  newItemId,
}: CvNewScreenViewProps) {
  const t = useTranslations("cvs");
  const tFeatures = useTranslations("features");

  const bar = beta ? (
    <PhoneTopBarEnd>
      <PhonePill>{tFeatures("beta")}</PhonePill>
    </PhoneTopBarEnd>
  ) : null;

  const head = (
    <div>
      <h1 className="ph-h1 ph-h1-26">{t("new.title")}</h1>
      <p className="ph-lead">{t("new.description")}</p>
    </div>
  );

  if (countLoading || atLimit) {
    return (
      <div
        data-slot="phone-cv-new"
        data-state={countLoading ? "loading" : "limit"}
        className="ph-app ph-ce ph-ce-nobar ph-cn"
      >
        {bar}
        {head}
        {countLoading ? (
          // Neither branch until the count is known: a form swapped for the
          // limit card would throw away what was typed meanwhile.
          <PhoneSkeleton label={t("list.loading")}>
            <PhoneSkeletonCard className="h-[540px]" />
            <PhoneSkeletonCard className="h-[414px]" />
          </PhoneSkeleton>
        ) : (
          <div role="status" data-slot="cv-new-limit" className="ph-cn-limit">
            <p className="ph-cn-limit-t">{t("new.limitReason")}</p>
            <Link
              href={cancelHref}
              data-action="back-to-cvs"
              className="ph-btn ph-sec"
            >
              {t("page.back")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      data-slot="phone-cv-new"
      data-state="form"
      className="ph-app ph-ce ph-cn"
      onSubmit={(event) => {
        if (creating) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      {bar}
      {head}

      <PhoneCvSections
        form={form}
        disabled={creating}
        newItemId={newItemId}
        subline="description"
      />

      <CvNewPreview form={form} />

      <PhoneActionBar>
        <Link
          href={cancelHref}
          data-action="cancel-cv"
          aria-disabled={creating || undefined}
          data-disabled={creating || undefined}
          className="ph-btn ph-sec ph-dr-lead-btn"
          onClick={(event) => {
            if (creating) event.preventDefault();
          }}
        >
          {t("editor.cancel")}
        </Link>
        <button
          type="submit"
          data-action="create-cv"
          aria-disabled={creating || undefined}
          aria-busy={creating || undefined}
          data-disabled={creating || undefined}
          className="ph-btn ph-pri ph-dr-go-btn"
        >
          {creating ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {t("new.submit")}
        </button>
      </PhoneActionBar>
    </form>
  );
}

/**
 * The board's "Live preview" card holding today's live preview: the CV the
 * form holds, as A4 sheets 210px wide (`useCvPageFlow` scales to the frame's
 * width), each sheet's page indicator, and the layout notice said once, as
 * the figure's caption.
 */
function CvNewPreview({ form }: { form: UseFormReturn<CvFormValues> }) {
  const t = useTranslations("cvs.preview");
  // The same derivation as `BaseCvEditor`: the form's values, watched live.
  const previewCv = useCvPreviewData(form.control);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-slot="cv-new-preview"
      className="ph-card ph-cn-pv"
    >
      <h2 id={headingId} className="ph-cn-pv-h">
        {t("livePreview")}
      </h2>
      <CvDocumentPreview cv={previewCv} className="ph-cn-figure" />
    </section>
  );
}
