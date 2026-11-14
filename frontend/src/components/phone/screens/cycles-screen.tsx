"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Trash } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import { PhoneField, PhoneInput } from "@/components/phone/phone-field";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { PhoneSheet } from "@/components/phone/phone-sheet";
import {
  bothLoad,
  fromQuery,
  mapLoad,
} from "@/components/phone/phone-query-load";
import { useCycleContext } from "@/contexts/cycle-context";
import { useCreateCycle, useCycles, useDeleteCycle } from "@/hooks/use-cycles";
import { useGeneralStats } from "@/hooks/use-statistics";
import { MIN_APPLICATIONS_FOR_CYCLE } from "@/lib/cycles";

export interface CyclesCurrentSummary {
  /** `useGeneralStats(null)`: the current cycle's numbers. */
  applications: number;
  offers: number;
  /** When the current cycle began (the newest archived cycle's `created_at`); `null` before any. */
  since: Date | null;
}

export interface CyclesArchivedItem {
  id: string;
  name: string;
  createdAt: Date;
  /** "· 41 applications": `GET /cycles` sends no count today, so absent. */
  applications?: number;
}

export interface CyclesScreenViewProps {
  current: PhoneLoad<CyclesCurrentSummary>;
  /** The board's "Fall 2026": the API names archived cycles only, so absent today. */
  currentName?: string;
  /** 10+ applications in the current cycle (today's `CycleSelector` rule); else no New Cycle. */
  canStartCycle: boolean;
  newCycleOpen: boolean;
  onNewCycleOpenChange: (open: boolean) => void;
  /** Trimmed, never empty. Close the sheet on success. */
  onStartCycle: (name: string) => void;
  startingCycle: boolean;
  archived: PhoneLoad<readonly CyclesArchivedItem[]>;
  /** Before the View link navigates: view this cycle (`setSelectedCycleId`). */
  onView: (cycle: CyclesArchivedItem) => void;
  /** Where View goes: the phone Pipeline. */
  viewHref?: string;
  /** The cycle the delete sheet asks about; `null` closes it. */
  deleteTarget: CyclesArchivedItem | null;
  onDeleteTargetChange: (cycle: CyclesArchivedItem | null) => void;
  /** Keep the sheet open while `deleting`; clear the target on success. */
  onConfirmDelete: () => void;
  deleting: boolean;
}

/** A section's error inside a board card: the card is already drawn. */
const INSET_ERROR = "rounded-none bg-transparent p-0 shadow-none";

/** v2/Cycles below md: props in, the board out. */
export function CyclesScreenView({
  current,
  currentName,
  canStartCycle,
  newCycleOpen,
  onNewCycleOpenChange,
  onStartCycle,
  startingCycle,
  archived,
  onView,
  viewHref = "/applications",
  deleteTarget,
  onDeleteTargetChange,
  onConfirmDelete,
  deleting,
}: CyclesScreenViewProps) {
  const t = useTranslations("cycles");
  const tPhone = useTranslations("phone.cycles");
  const tSelector = useTranslations("cycleSelector");
  const format = useFormatter();
  const currentId = useId();
  const archivedId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  // The delete sheet's words outlive the target while it closes.
  const [shownTarget, setShownTarget] = useState<CyclesArchivedItem | null>(
    deleteTarget,
  );
  if (deleteTarget !== null && deleteTarget !== shownTarget) {
    setShownTarget(deleteTarget);
  }

  const day = (date: Date) =>
    format.dateTime(date, { month: "short", day: "numeric", year: "numeric" });
  const trimmed = name.trim();
  const startLocked = trimmed === "" || startingCycle;

  return (
    <div data-slot="phone-cycles" className="ph-app ph-cy">
      <div>
        <h1 ref={heading} tabIndex={-1} className="ph-h1 ph-focus-target">
          {t("title")}
        </h1>
        <p className="ph-lead">{t("lead")}</p>
      </div>

      <section
        aria-labelledby={currentId}
        data-slot="cycles-current"
        className="ph-card ph-cy-current"
      >
        <div className="ph-cy-current-head">
          <h2 id={currentId} className="ph-cy-eyebrow">
            {tSelector("current")}
          </h2>
          <PhonePill tone="pri">{tPhone("active")}</PhonePill>
        </div>
        {currentName ? <p className="ph-cy-name">{currentName}</p> : null}
        <PhoneLoadable
          state={current}
          errorClassName={INSET_ERROR}
          loading={
            <PhoneSkeleton label={tPhone("loading")}>
              <PhoneSkeletonCard className="h-4 w-56 rounded-md" />
            </PhoneSkeleton>
          }
        >
          {(summary) => (
            <p className="ph-mono ph-cy-stats">
              {tPhone("applications", { count: summary.applications })}
              {" · "}
              {tPhone("offers", { count: summary.offers })}
              {summary.since ? (
                <>
                  {" · "}
                  {tPhone("since", {
                    date: format.dateTime(summary.since, {
                      month: "short",
                      day: "numeric",
                    }),
                  })}
                </>
              ) : null}
            </p>
          )}
        </PhoneLoadable>
        {canStartCycle ? (
          <button
            type="button"
            aria-haspopup="dialog"
            data-action="new-cycle"
            className="ph-btn ph-sm ph-sec"
            onClick={() => {
              setName("");
              onNewCycleOpenChange(true);
            }}
          >
            {tSelector("new")}
          </button>
        ) : null}
      </section>

      <section aria-labelledby={archivedId} data-slot="cycles-archived">
        <h2 id={archivedId} className="ph-gh">
          {tPhone("archived")}
        </h2>
        <PhoneLoadable
          state={archived}
          loading={
            <PhoneSkeleton label={tPhone("loading")}>
              <PhoneSkeletonCard className="h-[76px]" />
              <PhoneSkeletonCard className="h-[76px]" />
            </PhoneSkeleton>
          }
        >
          {(cycles) =>
            cycles.length === 0 ? (
              <div data-slot="cycles-empty" className="ph-card ph-cy-empty">
                <p className="ph-cy-title">{t("emptyTitle")}</p>
                <p className="ph-hint">{tPhone("emptyBody")}</p>
              </div>
            ) : (
              <ul className="ph-cy-list">
                {cycles.map((cycle) => (
                  <ArchivedCard
                    key={cycle.id}
                    cycle={cycle}
                    created={day(cycle.createdAt)}
                    viewHref={viewHref}
                    onView={() => onView(cycle)}
                    onDelete={() => onDeleteTargetChange(cycle)}
                  />
                ))}
              </ul>
            )
          }
        </PhoneLoadable>
      </section>

      <PhoneSheet
        open={newCycleOpen}
        onOpenChange={onNewCycleOpenChange}
        title={tSelector("dialogTitle")}
        description={tPhone("newHint")}
        fallbackFocus={heading}
        className="ph-sheet-stack"
      >
        <form
          className="ph-sheet-stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!startLocked) onStartCycle(trimmed);
          }}
        >
          <PhoneField label={tPhone("nameLabel")}>
            <PhoneInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={tSelector("namePlaceholder")}
              autoComplete="off"
              maxLength={100}
            />
          </PhoneField>
          <div className="ph-sheet-actions">
            <button
              type="button"
              className="ph-btn ph-sec"
              onClick={() => onNewCycleOpenChange(false)}
            >
              {tSelector("cancel")}
            </button>
            <button
              type="submit"
              data-action="start-cycle"
              aria-disabled={startLocked || undefined}
              aria-busy={startingCycle || undefined}
              data-disabled={startLocked || undefined}
              className="ph-btn ph-pri"
            >
              {startingCycle ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {startingCycle ? tSelector("creating") : tSelector("start")}
            </button>
          </div>
        </form>
      </PhoneSheet>

      <PhoneConfirmSheet
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) onDeleteTargetChange(null);
        }}
        title={t("dialogTitle")}
        description={t.rich("dialogBody", {
          name: shownTarget?.name ?? "",
          b: (chunks) => <strong className="ph-strong">{chunks}</strong>,
        })}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirm")}
        pendingLabel={t("deleting")}
        pending={deleting}
        confirmAction="confirm-delete-cycle"
        fallbackFocus={heading}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

function ArchivedCard({
  cycle,
  created,
  viewHref,
  onView,
  onDelete,
}: {
  cycle: CyclesArchivedItem;
  created: string;
  viewHref: string;
  onView: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("cycles");
  const tPhone = useTranslations("phone.cycles");
  const nameId = useId();

  return (
    <li
      data-slot="cycle-row"
      data-cycle-id={cycle.id}
      className="ph-card ph-cy-card"
    >
      <div className="ph-cy-card-main">
        <div id={nameId} className="ph-cy-title">
          {cycle.name}
        </div>
        <div className="ph-cy-sub">
          {t("created", { date: created })}
          {cycle.applications !== undefined ? (
            <>
              {" · "}
              {tPhone("applications", { count: cycle.applications })}
            </>
          ) : null}
        </div>
      </div>
      <Link
        href={viewHref}
        data-action="view-cycle"
        aria-describedby={nameId}
        className="ph-btn ph-sm ph-sec"
        onClick={onView}
      >
        {t("view")}
      </Link>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={tPhone("deleteLabel", { name: cycle.name })}
        data-action="delete-cycle"
        className="ph-iconbtn ph-cy-trash"
        onClick={onDelete}
      >
        <Trash size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * v2/Cycles with its data (`/cycles` below md): the current cycle's numbers
 * (`useGeneralStats(null)`), the archived cycles (`useCycles`), and today's
 * create and delete calls. New Cycle shows from 10 applications, as the
 * desktop cycle selector does. Both mutations view the current cycle again
 * on success, as today.
 */
export function CyclesScreen() {
  const { setSelectedCycleId } = useCycleContext();
  const stats = useGeneralStats(null);
  const cycles = useCycles();
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CyclesArchivedItem | null>(
    null,
  );

  const createCycle = useCreateCycle({
    onSuccess: () => {
      setNewCycleOpen(false);
      setSelectedCycleId(null);
    },
  });
  const deleteCycle = useDeleteCycle({
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedCycleId(null);
    },
  });

  const archived = mapLoad(fromQuery(cycles), (list) =>
    list.map(
      (cycle): CyclesArchivedItem => ({
        id: cycle.id,
        name: cycle.name,
        createdAt: new Date(cycle.created_at),
      }),
    ),
  );
  const current = mapLoad(
    bothLoad(fromQuery(stats), archived),
    ([summary, list]): CyclesCurrentSummary => ({
      applications: summary.total_applications,
      offers: summary.offers,
      // The current cycle began when the newest archived one was closed.
      since: list.reduce<Date | null>(
        (latest, cycle) =>
          latest === null || cycle.createdAt > latest
            ? cycle.createdAt
            : latest,
        null,
      ),
    }),
  );

  return (
    <CyclesScreenView
      current={current}
      canStartCycle={
        (stats.data?.total_applications ?? 0) >= MIN_APPLICATIONS_FOR_CYCLE
      }
      newCycleOpen={newCycleOpen}
      onNewCycleOpenChange={setNewCycleOpen}
      onStartCycle={(name) => createCycle.mutate({ name })}
      startingCycle={createCycle.isPending}
      archived={archived}
      onView={(cycle) => setSelectedCycleId(cycle.id)}
      deleteTarget={deleteTarget}
      onDeleteTargetChange={(cycle) => {
        // The sheet stays while its delete runs, as today's dialog does.
        if (cycle === null && deleteCycle.isPending) return;
        setDeleteTarget(cycle);
      }}
      onConfirmDelete={() => {
        if (deleteTarget) deleteCycle.mutate(deleteTarget.id);
      }}
      deleting={deleteCycle.isPending}
    />
  );
}
