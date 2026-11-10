"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, Pen, Plus, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  reportWebhookBadgesAttr,
  reportWebhookDeleteDescription,
  reportWebhookTargetName,
  type ReportWebhookRow,
} from "@/components/admin/report-webhook-list";
import { MEMBERSHIP_BADGE_LABEL } from "@/components/badges/membership-badge";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import {
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import {
  PhoneAlertCard,
  PhoneEmptyCard,
} from "@/components/phone/phone-state-card";

export interface AdminReportWebhooksScreenViewProps {
  /** `useAdminReportWebhooks()`: masked URLs only, as the API sends them. */
  webhooks: PhoneLoad<readonly ReportWebhookRow[]>;
  /** Opens the add sheet (`PhoneReportWebhookSheet`, mounted by the page). */
  onAdd: () => void;
  /** Opens the edit sheet on the row. */
  onEdit: (webhook: ReportWebhookRow) => void;
  /**
   * After the delete sheet's confirm. Resolves with the refusal's words, which
   * the sheet shows in place (no toast), or with nothing once it is deleted.
   */
  onDelete: (webhook: ReportWebhookRow) => Promise<string | void>;
  /** The id whose DELETE is in flight. */
  deletingId: string | null;
}

/**
 * v3/AdminWebhook below md (under `AdminPhoneHeader`, which heads it
 * "Report webhooks" with its lead): props in, the board out. One card per
 * webhook, "Add webhook" after them, Delete confirmed in the board's sheet,
 * which stays open while the delete runs and shows a refusal in place.
 */
export function AdminReportWebhooksScreenView({
  webhooks,
  onAdd,
  onEdit,
  onDelete,
  deletingId,
}: AdminReportWebhooksScreenViewProps) {
  const t = useTranslations("admin.webhooks.list");
  const tCommon = useTranslations("common");
  const addButton = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<ReportWebhookRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The deleted card leaves after the sheet handed focus back to its Delete.
  const handOff = useRef<string | null>(null);
  const rows = webhooks.status === "ready" ? webhooks.data : null;

  useEffect(() => {
    const id = handOff.current;
    if (!id || rows === null || rows.some((row) => row.id === id)) return;
    handOff.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    addButton.current?.focus();
  }, [rows]);

  return (
    <div data-slot="phone-admin-webhooks" className="ph-app ph-ad-body">
      <PhoneLoadable
        state={webhooks}
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="h-[134px]" />
            <PhoneSkeletonCard className="h-[134px]" />
          </PhoneSkeleton>
        }
        error={(failure) => (
          <PhoneAlertCard
            data-slot="report-webhooks-error"
            title={t("errorTitle")}
            body={t("errorBody")}
            retryLabel={t("retry")}
            onRetry={failure.onRetry}
            retrying={failure.retrying}
          />
        )}
      >
        {(list) =>
          list.length === 0 ? (
            <PhoneEmptyCard
              data-slot="report-webhooks-empty"
              title={t("emptyTitle")}
              body={t("emptyBody")}
            />
          ) : (
            <ul data-slot="report-webhooks" className="ph-wh-list">
              {list.map((row) => (
                <WebhookCard
                  key={row.id}
                  row={row}
                  deleting={deletingId === row.id}
                  onEdit={() => onEdit(row)}
                  onDelete={() => {
                    setTarget(row);
                    setRefusal(null);
                    setOpen(true);
                  }}
                />
              ))}
            </ul>
          )
        }
      </PhoneLoadable>

      <button
        ref={addButton}
        type="button"
        aria-haspopup="dialog"
        data-action="add-webhook"
        className="ph-btn ph-pri"
        onClick={onAdd}
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        {t("add")}
      </button>

      <PhoneSheetFrame
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        alert
        described
        fallbackFocus={addButton}
      >
        <span className="ph-grab" aria-hidden="true" />
        <PhoneSheetTitle className="ph-h2 ph-wh-sheet-h">
          {t("deleteTitle")}
        </PhoneSheetTitle>
        <PhoneSheetDescription className="ph-hint ph-wh-sheet-d">
          {target ? reportWebhookDeleteDescription(target) : null}
        </PhoneSheetDescription>
        {refusal ? (
          <div
            role="alert"
            data-slot="report-webhook-delete-error"
            data-tone="error"
            className="ph-notice ph-wh-refusal"
          >
            <CircleAlert
              size={16}
              aria-hidden="true"
              className="ph-notice-ic"
            />
            <p>{refusal}</p>
          </div>
        ) : null}
        <div data-slot="delete-webhook-sheet" className="ph-wh-actions">
          {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
          <button
            type="button"
            aria-disabled={pending || undefined}
            data-disabled={pending || undefined}
            className="ph-btn ph-sec"
            onClick={() => {
              if (!pending) setOpen(false);
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-disabled={pending || undefined}
            data-action="confirm-delete-webhook"
            className="ph-btn ph-dan"
            onClick={async () => {
              if (!target || pending) return;
              setPending(true);
              setRefusal(null);
              handOff.current = target.id;
              const refused = await onDelete(target);
              setPending(false);
              if (refused) {
                handOff.current = null;
                setRefusal(refused);
                return;
              }
              setOpen(false);
            }}
          >
            {pending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {t("deleteConfirm")}
          </button>
        </div>
      </PhoneSheetFrame>
    </div>
  );
}

function WebhookCard({
  row,
  deleting,
  onEdit,
  onDelete,
}: {
  row: ReportWebhookRow;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.webhooks.list");
  const label = row.label?.trim() ? row.label : null;
  const target = reportWebhookTargetName(row);

  return (
    <li
      data-slot="report-webhook-row"
      data-webhook-id={row.id}
      data-badges={reportWebhookBadgesAttr(row)}
      aria-busy={deleting || undefined}
      data-deleting={deleting || undefined}
      className="ph-card ph-wh-card"
    >
      <div className="ph-wh-head">
        <span data-unlabelled={label ? undefined : ""} className="ph-wh-label">
          {label ?? t("unlabelled")}
        </span>
        {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("edit", { target })}
          aria-disabled={deleting || undefined}
          data-disabled={deleting || undefined}
          data-action="edit-webhook"
          className="ph-iconbtn ph-flat"
          onClick={() => {
            if (!deleting) onEdit();
          }}
        >
          <Pen size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("delete", { target })}
          aria-disabled={deleting || undefined}
          aria-busy={deleting || undefined}
          data-disabled={deleting || undefined}
          data-action="delete-webhook"
          className="ph-iconbtn ph-flat ph-wh-del"
          onClick={() => {
            if (!deleting) onDelete();
          }}
        >
          {deleting ? (
            <Loader2 size={18} aria-hidden="true" className="ph-spin" />
          ) : (
            <Trash size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      <dl className="ph-wh-dl">
        <dt>{t("badgeTerm")}</dt>
        <dd data-slot="report-webhook-badges" className="ph-wh-badges-dd">
          {row.badges.length > 0 ? (
            row.badges.map((badge) => (
              <span
                key={badge}
                data-slot="report-webhook-badge"
                data-badge={badge}
                className="ph-pill ph-pri"
              >
                {MEMBERSHIP_BADGE_LABEL[badge]}
              </span>
            ))
          ) : (
            <span className="ph-wh-none">{t("noBadge")}</span>
          )}
        </dd>
        <dt>{t("webhookTerm")}</dt>
        <dd data-slot="report-webhook-url" className="ph-mono ph-wh-url">
          {row.webhook_url_masked}
        </dd>
      </dl>
    </li>
  );
}
