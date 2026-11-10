"use client";

import type { FormEventHandler } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import type { CvFormValues } from "@/components/base-cvs/types";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { PhoneCvSections } from "@/components/phone/phone-cv-sections";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";

export interface CvEditorScreenViewProps {
  /** No `?id=`: today's "No CV selected" in a board card. */
  noId?: boolean;
  /** `useBaseCv(id)`: the form is seeded once it is ready (the page's own seeding). */
  cv: PhoneLoad<unknown>;
  /** The page's form (`baseCvSchema`), seeded with `baseCvToFormValues`. */
  form: UseFormReturn<CvFormValues>;
  /** `form.handleSubmit(save, onInvalid)`: the bar's "Save changes" submits it. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** The PUT is in flight: Save spins and ignores taps, every field locks. */
  saving: boolean;
  /** Where Cancel goes. */
  cancelHref?: string;
  /** `useExportBaseCvPdf().mutate({id, name})` with the STORED name. */
  onExportPdf: () => void;
  /** The server is typesetting: the PDF button spins, the live region says so. */
  exportingPdf: boolean;
  newItemId?: () => string;
}

/** v2/CVEditor below md: props in, the board out. No live preview (PRD 0021). */
export function CvEditorScreenView({
  noId = false,
  cv,
  form,
  onSubmit,
  saving,
  cancelHref = "/cvs",
  onExportPdf,
  exportingPdf,
  newItemId,
}: CvEditorScreenViewProps) {
  const t = useTranslations("cvs");
  const tPhone = useTranslations("phone.cvEditor");

  const head = (
    <div>
      <h1 className="ph-h1 ph-ce-h1">{t("editorPage.title")}</h1>
      <p className="ph-lead">{t("editorPage.description")}</p>
    </div>
  );

  if (noId) {
    return (
      <div data-slot="phone-cv-editor" className="ph-app ph-ce ph-ce-nobar">
        {head}
        <div className="ph-card ph-ce-message">
          <p className="ph-ce-message-h">{t("editorPage.noIdTitle")}</p>
          <p className="ph-hint">{t("editorPage.noIdBody")}</p>
          <Link href={cancelHref} className="ph-btn ph-sm ph-sec">
            {t("page.back")}
          </Link>
        </div>
      </div>
    );
  }

  if (cv.status !== "ready") {
    return (
      <div data-slot="phone-cv-editor" className="ph-app ph-ce ph-ce-nobar">
        {head}
        {cv.status === "error" ? (
          <p className="ph-ce-message-h">{t("editorPage.loadErrorTitle")}</p>
        ) : null}
        <PhoneLoadable
          state={cv}
          loading={
            <PhoneSkeleton label={t("editorPage.loading")}>
              <PhoneSkeletonCard className="h-[540px]" />
            </PhoneSkeleton>
          }
        >
          {() => null}
        </PhoneLoadable>
      </div>
    );
  }

  return (
    <form
      noValidate
      data-slot="phone-cv-editor"
      className="ph-app ph-ce"
      onSubmit={(event) => {
        if (saving) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <PhoneTopBarEnd>
        <button
          type="button"
          aria-label={t("export.pdfLabel")}
          aria-disabled={exportingPdf || undefined}
          aria-busy={exportingPdf || undefined}
          data-action="download-pdf"
          className="ph-btn ph-sm ph-sec"
          onClick={() => {
            if (!exportingPdf) onExportPdf();
          }}
        >
          {exportingPdf ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : (
            <Download size={16} aria-hidden="true" />
          )}
          {tPhone("pdf")}
        </button>
      </PhoneTopBarEnd>
      {/* Empty but mounted: a region inserted with its words may not announce. */}
      <p className="ph-sr" aria-live="polite" aria-atomic="true">
        {exportingPdf ? t("export.pdfPending") : ""}
      </p>

      {head}

      <PhoneCvSections form={form} disabled={saving} newItemId={newItemId} />

      <PhoneActionBar>
        <Link
          href={cancelHref}
          data-action="cancel-cv"
          className="ph-btn ph-sec ph-dr-lead-btn"
        >
          {t("editor.cancel")}
        </Link>
        <button
          type="submit"
          data-action="save-cv"
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
          data-disabled={saving || undefined}
          className="ph-btn ph-pri ph-dr-go-btn"
        >
          {saving ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {t("editorPage.submit")}
        </button>
      </PhoneActionBar>
    </form>
  );
}
