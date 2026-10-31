"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AxiosError } from "axios";

import {
  EMPTY_REPORT_WEBHOOK_FORM,
  ReportWebhookFormDialog,
  reportWebhookToFormValues,
  type ReportWebhookFormMode,
  type ReportWebhookFormValues,
} from "@/components/admin/report-webhook-form-dialog";
import {
  ReportWebhookList,
  type ReportWebhookRow,
} from "@/components/admin/report-webhook-list";
import {
  MEMBERSHIP_BADGE_KEYS,
  type MembershipBadgeKey,
} from "@/components/badges/membership-badge";
import {
  useAdminReportWebhooks,
  useCreateReportWebhook,
  useDeleteReportWebhook,
  useUpdateReportWebhook,
} from "@/hooks/use-admin";
import { word } from "@/i18n/translator";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  CreateReportWebhook,
  UpdateReportWebhook,
} from "@/services/types/admin";

/**
 * Admin report webhooks (ADR-0024): each webhook holds one or more Borderless
 * badges, and a member's report is posted to every webhook holding one of
 * their badges. The
 * list and the dialog are ui-designer components; this page owns the query,
 * the zod schema mirroring the server's validators
 * (`backend/app/application/validators/report_webhook.py`) and the
 * add/edit/delete wiring.
 */

const WEBHOOK_URL_RE =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([\w-]{20,})$/;
// Postgres BIGINT upper bound, compared as BigInt: a 20-digit string already
// loses precision in a JS number.
const BIGINT_MAX = BigInt("9223372036854775807");

/** The server's `validate_webhook_url`; `webhook-url-parity.test.ts` holds
 * both to the cases in `backend/tests/fixtures/report-webhook-urls.json`. */
export function isValidWebhookUrl(value: string): boolean {
  const match = WEBHOOK_URL_RE.exec(value);
  if (!match) return false;
  try {
    return BigInt(match[1]) <= BIGINT_MAX;
  } catch {
    return false;
  }
}

function sameBadges(
  a: readonly MembershipBadgeKey[],
  b: readonly MembershipBadgeKey[],
): boolean {
  return a.length === b.length && a.every((badge) => b.includes(badge));
}

function reportWebhookSchema(mode: ReportWebhookFormMode) {
  return z
    .object({
      webhook_url: z.string(),
      badges: z.array(z.enum(MEMBERSHIP_BADGE_KEYS)),
      label: z.string(),
    })
    .superRefine((values, ctx) => {
      const url = values.webhook_url.trim();
      if (mode === "add" && !url) {
        ctx.addIssue({
          code: "custom",
          path: ["webhook_url"],
          message: word("admin.webhooks.validation.urlRequired"),
        });
      } else if (url && !isValidWebhookUrl(url)) {
        ctx.addIssue({
          code: "custom",
          path: ["webhook_url"],
          message: word("admin.webhooks.validation.urlInvalid"),
        });
      }
      // At least one on create, and an edit never empties the set (a
      // carried-over row with none gets one here). Same words as the API.
      if (values.badges.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["badges"],
          message: word("admin.webhooks.validation.badgesRequired"),
        });
      }
      // Code points, matching the server's Python `len()`.
      if ([...values.label].length > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["label"],
          message: word("admin.webhooks.validation.labelTooLong", {
            max: "100",
          }),
        });
      }
    });
}

const ADD_SCHEMA = reportWebhookSchema("add");
const EDIT_SCHEMA = reportWebhookSchema("edit");

/**
 * The error's words for a 404/409/422 by code (`lib/api-error-message.ts`);
 * a body with no code the web knows and no string `detail` gets a fixed line.
 */
function serverErrorFrom(err: AxiosError): string {
  return apiErrorMessage(
    err.response?.data,
    word("admin.webhooks.page.saveFailed"),
  );
}

export function ReportWebhooksPage() {
  const t = useTranslations("admin.webhooks.page");
  const {
    data: webhooks,
    isLoading,
    isError,
    refetch,
  } = useAdminReportWebhooks();
  const createMutation = useCreateReportWebhook();
  const updateMutation = useUpdateReportWebhook();
  const deleteMutation = useDeleteReportWebhook();

  const [addOpen, setAddOpen] = useState(false);
  const [addServerError, setAddServerError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ReportWebhookRow | null>(null);
  const [editServerError, setEditServerError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Kept across the close animation, so the closing dialog still shows
  // "Current: <masked>" instead of snapping to the add-mode help.
  const lastEditMasked = useRef<string | null>(null);

  const addForm = useForm<ReportWebhookFormValues>({
    resolver: zodResolver(ADD_SCHEMA),
    defaultValues: EMPTY_REPORT_WEBHOOK_FORM,
  });
  const editForm = useForm<ReportWebhookFormValues>({
    resolver: zodResolver(EDIT_SCHEMA),
    defaultValues: EMPTY_REPORT_WEBHOOK_FORM,
  });

  // A server error belongs to the submission that produced it, never to a
  // fresh open of the same dialog.
  useEffect(() => {
    if (addOpen) {
      setAddServerError(null);
      addForm.reset(EMPTY_REPORT_WEBHOOK_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen]);

  useEffect(() => {
    if (editTarget) {
      setEditServerError(null);
      lastEditMasked.current = editTarget.webhook_url_masked;
      editForm.reset(reportWebhookToFormValues(editTarget));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget]);

  const handleCreate = (values: ReportWebhookFormValues) => {
    if (values.badges.length === 0) return;
    const label = values.label.trim();
    const payload: CreateReportWebhook = {
      webhook_url: values.webhook_url.trim(),
      badges: values.badges,
      label: label ? label : undefined,
    };
    createMutation.mutate(payload, {
      onSuccess: () => setAddOpen(false),
      onError: (err: AxiosError) => setAddServerError(serverErrorFrom(err)),
    });
  };

  const handleUpdate = (values: ReportWebhookFormValues) => {
    if (!editTarget) return;
    const dirty = editForm.formState.dirtyFields;
    const payload: UpdateReportWebhook = {};
    // A blank URL keeps the stored one.
    if (dirty.webhook_url && values.webhook_url.trim()) {
      payload.webhook_url = values.webhook_url.trim();
    }
    // The set is sent whole, and only when it differs from the stored one.
    if (
      values.badges.length > 0 &&
      !sameBadges(values.badges, editTarget.badges)
    ) {
      payload.badges = values.badges;
    }
    if (dirty.label) {
      const label = values.label.trim();
      payload.label = label ? label : null;
    }
    updateMutation.mutate(
      { id: editTarget.id, data: payload },
      {
        onSuccess: () => setEditTarget(null),
        onError: (err: AxiosError) => setEditServerError(serverErrorFrom(err)),
      },
    );
  };

  const handleDelete = (row: ReportWebhookRow) => {
    setDeletingId(row.id);
    deleteMutation.mutate(row.id, {
      onSettled: () => setDeletingId(null),
    });
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
          {t("title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </motion.div>

      <ReportWebhookList
        webhooks={webhooks}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onAdd={() => setAddOpen(true)}
        onEdit={(row) => setEditTarget(row)}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

      <ReportWebhookFormDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        form={addForm}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        serverError={addServerError}
      />

      <ReportWebhookFormDialog
        mode="edit"
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        form={editForm}
        onSubmit={handleUpdate}
        isPending={updateMutation.isPending}
        serverError={editServerError}
        currentUrlMasked={
          editTarget?.webhook_url_masked ?? lastEditMasked.current
        }
      />
    </div>
  );
}
