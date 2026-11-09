"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  BASE_CVS_MAX,
  skillKeywords,
  type BaseCv,
} from "@/components/base-cvs/types";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { fromQuery } from "@/components/phone/phone-query-load";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useDeleteBaseCv } from "@/hooks/use-delete-base-cv";
import { useHasFeature } from "@/hooks/use-features";

export interface CvsScreenViewProps {
  /** `useHasFeature("cvs").stage === "beta"`: the board's "Beta" pill in the top bar. */
  beta: boolean;
  /** `useBaseCvs()` as a `PhoneLoad`. */
  cvs: PhoneLoad<readonly BaseCv[]>;
  /** `BASE_CVS_MAX`: the new tile shows the slots left and hides at the cap. */
  max?: number;
  editHref?: (cv: BaseCv) => string;
  newHref?: string;
  /** The CV the delete sheet asks about; `null` closes it. */
  deleteTarget: BaseCv | null;
  onDeleteTargetChange: (cv: BaseCv | null) => void;
  /** Keep the sheet open while `deleting`; clear the target on success. */
  onConfirmDelete: () => void;
  deleting: boolean;
}

function defaultEditHref(cv: BaseCv): string {
  return `/cvs/editor?id=${encodeURIComponent(cv.id)}`;
}

/** v2/CVs below md: props in, the board out. */
export function CvsScreenView({
  beta,
  cvs,
  max = BASE_CVS_MAX,
  editHref = defaultEditHref,
  newHref = "/cvs/new",
  deleteTarget,
  onDeleteTargetChange,
  onConfirmDelete,
  deleting,
}: CvsScreenViewProps) {
  const t = useTranslations("cvs");
  const tPhone = useTranslations("phone.cvs");
  const tFeatures = useTranslations("features");
  const heading = useRef<HTMLHeadingElement>(null);
  // The sheet's words outlive the target while it closes.
  const [shownTarget, setShownTarget] = useState<BaseCv | null>(deleteTarget);
  if (deleteTarget !== null && deleteTarget !== shownTarget) {
    setShownTarget(deleteTarget);
  }

  return (
    <div data-slot="phone-cvs" className="ph-app ph-cv">
      {beta ? (
        <PhoneTopBarEnd>
          <PhonePill>{tFeatures("beta")}</PhonePill>
        </PhoneTopBarEnd>
      ) : null}

      <div>
        <h1 ref={heading} tabIndex={-1} className="ph-h1 ph-focus-target">
          {t("page.title")}
        </h1>
        <p className="ph-lead">{t("page.description")}</p>
      </div>

      <PhoneLoadable
        state={cvs}
        className="ph-cv-body"
        loading={
          <PhoneSkeleton label={t("list.loading")}>
            <PhoneSkeletonCard className="h-[214px]" />
            <PhoneSkeletonCard className="h-[214px]" />
          </PhoneSkeleton>
        }
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
                <ul data-slot="cv-list" className="ph-cv-list">
                  {list.map((cv) => (
                    <PhoneCvCard
                      key={cv.id}
                      cv={cv}
                      href={editHref(cv)}
                      deleting={deleting && deleteTarget?.id === cv.id}
                      onDelete={() => onDeleteTargetChange(cv)}
                    />
                  ))}
                </ul>
              )}
              {remaining > 0 ? (
                <Link
                  href={newHref}
                  data-slot="cv-new-tile"
                  data-action="new-cv"
                  className="ph-cv-new"
                >
                  <Plus
                    size={22}
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
            </>
          );
        }}
      </PhoneLoadable>

      <PhoneConfirmSheet
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) onDeleteTargetChange(null);
        }}
        title={t("card.deleteTitle")}
        description={t("card.deleteDescription", {
          name: shownTarget?.name ?? "",
        })}
        cancelLabel={t("card.cancel")}
        confirmLabel={t("card.delete")}
        pendingLabel={tPhone("deleting")}
        pending={deleting}
        confirmAction="confirm-delete-cv"
        fallbackFocus={heading}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

function PhoneCvCard({
  cv,
  href,
  deleting,
  onDelete,
}: {
  cv: BaseCv;
  href: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("cvs.card");
  const format = useFormatter();
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

  return (
    <li
      data-slot="cv-card"
      data-cv-id={cv.id}
      data-deleting={deleting || undefined}
      className="ph-card ph-cv-card"
    >
      <div className="ph-cv-head">
        <span className="ph-cv-thumb" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <div className="ph-cv-who">
          <h2 className="ph-cv-name">{cv.name}</h2>
          {cv.headline ? <p className="ph-cv-headline">{cv.headline}</p> : null}
          {updated ? (
            <p className="ph-cv-updated">{t("updated", { date: updated })}</p>
          ) : null}
        </div>
      </div>
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
      <div className="ph-cv-actions">
        <Link
          href={href}
          aria-label={t("editLabel", { name: cv.name })}
          data-action="edit-cv"
          className="ph-btn ph-sm ph-sec"
        >
          {t("edit")}
        </Link>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("deleteLabel", { name: cv.name })}
          aria-disabled={deleting || undefined}
          data-disabled={deleting || undefined}
          data-action="delete-cv"
          className="ph-btn ph-sm ph-dan"
          onClick={() => {
            if (!deleting) onDelete();
          }}
        >
          {t("delete")}
        </button>
      </div>
    </li>
  );
}

/**
 * v2/CVs on today's hooks (`cvs-page.tsx`'s gallery): the master CVs and the
 * delete, confirmed in a sheet that stays open while it runs and closes on
 * success (a failure toasts, as today, and keeps the sheet for Cancel).
 */
export function CvsScreen() {
  const beta = useHasFeature("cvs").stage === "beta";
  const cvs = useBaseCvs();
  const [deleteTarget, setDeleteTarget] = useState<BaseCv | null>(null);
  const deleteCv = useDeleteBaseCv();

  return (
    <CvsScreenView
      beta={beta}
      cvs={fromQuery(cvs)}
      deleteTarget={deleteTarget}
      onDeleteTargetChange={setDeleteTarget}
      onConfirmDelete={() => {
        if (!deleteTarget || deleteCv.isPending) return;
        deleteCv.mutate(deleteTarget.id, {
          onSuccess: () => setDeleteTarget(null),
        });
      }}
      deleting={deleteCv.isPending}
    />
  );
}
