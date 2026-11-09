"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  reportWebhookBadgesAttr,
  reportWebhookDeleteDescription,
  reportWebhookTargetName,
  type ReportWebhookRow,
} from "@/components/admin/report-webhook-list";
import { MEMBERSHIP_BADGE_LABEL } from "@/components/badges/membership-badge";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";

export interface AdminReportWebhooksScreenViewProps {
  /** `useAdminReportWebhooks()`: masked URLs only, as the API sends them. */
  webhooks: PhoneLoad<readonly ReportWebhookRow[]>;
  /** Opens today's `ReportWebhookFormDialog` in add mode. */
  onAdd: () => void;
  /** Opens it in edit mode for the row. */
  onEdit: (webhook: ReportWebhookRow) => void;
  /** After the sheet's confirm. */
  onDelete: (webhook: ReportWebhookRow) => void;
  /** The id whose DELETE is in flight. */
  deletingId: string | null;
}

/** v2/Admin's Report webhooks below md (under `AdminPhoneHeader`): props in, the board out. */
export function AdminReportWebhooksScreenView({
  webhooks,
  onAdd,
  onEdit,
  onDelete,
  deletingId,
}: AdminReportWebhooksScreenViewProps) {
  const t = useTranslations("admin.webhooks.list");
  const tPhone = useTranslations("phone.admin");
  const tCommon = useTranslations("common");
  const tPage = useTranslations("admin.webhooks.page");
  const addButton = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<ReportWebhookRow | null>(null);
  const [open, setOpen] = useState(false);
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
    <div
      data-slot="phone-admin-webhooks"
      className="ph-app ph-ad-body ph-ad-list"
    >
      {/* The board draws no section title: the chip names it; this h2 keeps the outline. */}
      <h2 className="ph-sr">{tPage("title")}</h2>
      <p className="ph-hint">{tPhone("webhooksHint")}</p>

      <PhoneLoadable
        state={webhooks}
        className="ph-ad-list-cards"
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="h-[132px]" />
            <PhoneSkeletonCard className="h-[132px]" />
          </PhoneSkeleton>
        }
      >
        {(list) =>
          list.length === 0 ? (
            <div
              data-slot="report-webhooks-empty"
              className="ph-card ph-ad-hook"
            >
              <p className="ph-ad-hook-label">{t("emptyTitle")}</p>
              <p className="ph-hint">{t("emptyBody")}</p>
            </div>
          ) : (
            <ul data-slot="report-webhooks" className="ph-ad-cards">
              {list.map((row) => (
                <WebhookCard
                  key={row.id}
                  row={row}
                  deleting={deletingId === row.id}
                  onEdit={() => onEdit(row)}
                  onDelete={() => {
                    setTarget(row);
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
        {t("add")}
      </button>

      <PhoneConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle")}
        description={target ? reportWebhookDeleteDescription(target) : ""}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("deleteConfirm")}
        confirmAction="confirm-delete-webhook"
        fallbackFocus={addButton}
        onConfirm={() => {
          setOpen(false);
          if (!target) return;
          handOff.current = target.id;
          onDelete(target);
        }}
      />
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
  const tPhone = useTranslations("phone.admin");
  const label = row.label?.trim() ? row.label : null;
  const target = reportWebhookTargetName(row);

  return (
    <li
      data-slot="report-webhook-row"
      data-webhook-id={row.id}
      data-badges={reportWebhookBadgesAttr(row)}
      aria-busy={deleting || undefined}
      data-deleting={deleting || undefined}
      className="ph-card ph-ad-hook"
    >
      <div className="ph-ad-hook-head">
        <span
          data-unlabelled={label ? undefined : ""}
          className="ph-ad-hook-label"
        >
          {label ?? t("unlabelled")}
        </span>
        {row.badges.length > 0 ? (
          <span data-slot="report-webhook-badges" className="ph-ad-hook-badges">
            {row.badges.map((badge) => (
              <span
                key={badge}
                data-slot="report-webhook-badge"
                data-badge={badge}
                className="ph-pill ph-pri"
              >
                {MEMBERSHIP_BADGE_LABEL[badge]}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {row.badges.length === 0 ? (
        <p data-slot="report-webhook-badges" className="ph-ad-hook-none">
          <BadgeAlert size={16} aria-hidden="true" />
          {t("noBadge")}
        </p>
      ) : null}
      <code data-slot="report-webhook-url" className="ph-mono ph-ad-hook-url">
        {row.webhook_url_masked}
      </code>
      <div className="ph-ad-hook-actions">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("edit", { target })}
          aria-disabled={deleting || undefined}
          data-disabled={deleting || undefined}
          data-action="edit-webhook"
          className="ph-btn ph-sm ph-sec"
          onClick={() => {
            if (!deleting) onEdit();
          }}
        >
          {tPhone("edit")}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("delete", { target })}
          aria-disabled={deleting || undefined}
          aria-busy={deleting || undefined}
          data-disabled={deleting || undefined}
          data-action="delete-webhook"
          className="ph-btn ph-sm ph-dan"
          onClick={() => {
            if (!deleting) onDelete();
          }}
        >
          {deleting ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {t("deleteConfirm")}
        </button>
      </div>
    </li>
  );
}
