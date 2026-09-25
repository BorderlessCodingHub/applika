"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AxiosError } from "axios";

import {
  DiscordWebhookFormDialog,
  discordWebhookToFormValues,
  EMPTY_DISCORD_WEBHOOK_FORM,
  type DiscordWebhookFormMode,
  type DiscordWebhookFormValues,
} from "@/components/admin/discord-webhook-form-dialog";
import {
  DiscordWebhookList,
  type DiscordWebhookRow,
} from "@/components/admin/discord-webhook-list";
import {
  useAdminDiscordWebhooks,
  useCreateDiscordWebhook,
  useDeleteDiscordWebhook,
  useUpdateDiscordWebhook,
} from "@/hooks/use-admin";
import { getApiError } from "@/lib/api-client";
import type {
  CreateDiscordWebhook,
  UpdateDiscordWebhook,
} from "@/services/types/admin";

/**
 * Admin report webhooks page (KODI-027, plan 0009 · T144/T145). Pattern:
 * `app/(protected)/admin/supports/supports-page.tsx`. The list and the
 * dialog shells are ui-designer components (`discord-webhook-list.tsx`,
 * `discord-webhook-form-dialog.tsx`); this component owns the query, the
 * zod schema mirroring the server's own validators
 * (`backend/app/application/validators/discord_webhook.py`) and the
 * add/edit/delete wiring.
 */

// ── Validation, mirroring the server exactly ─────────────────────────────

const SNOWFLAKE_RE = /^\d{17,20}$/;
const WEBHOOK_URL_RE =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([\w-]{20,})$/;
// Postgres BIGINT upper bound (compared as BigInt — never Number, a 20-digit
// numeric string already loses precision in a JS `number`).
const BIGINT_MAX = BigInt("9223372036854775807");

function isValidSnowflake(value: string): boolean {
  if (!SNOWFLAKE_RE.test(value)) return false;
  try {
    return BigInt(value) <= BIGINT_MAX;
  } catch {
    return false;
  }
}

function isValidWebhookUrl(value: string): boolean {
  const match = WEBHOOK_URL_RE.exec(value);
  if (!match) return false;
  try {
    return BigInt(match[1]) <= BIGINT_MAX;
  } catch {
    return false;
  }
}

/** Comma/space/newline separated, deduped, blanks dropped. Order preserved,
 * matching the server's own dedupe (T113). */
export function parseRoleIds(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function discordWebhookSchema(mode: DiscordWebhookFormMode) {
  return z
    .object({
      webhook_url: z.string(),
      guild_id: z.string(),
      role_ids: z.string(),
      label: z.string(),
    })
    .superRefine((values, ctx) => {
      const url = values.webhook_url.trim();
      if (mode === "add" && !url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhook_url"],
          message: "Webhook URL is required",
        });
      } else if (url && !isValidWebhookUrl(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhook_url"],
          message: "Invalid Discord webhook URL",
        });
      }

      const guildId = values.guild_id.trim();
      if (!guildId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["guild_id"],
          message: "Server id is required",
        });
      } else if (!isValidSnowflake(guildId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["guild_id"],
          message: "Invalid Discord server id",
        });
      }

      const roleIds = parseRoleIds(values.role_ids);
      if (roleIds.some((id) => !isValidSnowflake(id))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["role_ids"],
          message: "Invalid Discord role id",
        });
      } else if (roleIds.length > 25) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["role_ids"],
          message: "A webhook may hold at most 25 role ids",
        });
      }

      if (values.label.length > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["label"],
          message: "Label must be at most 100 characters",
        });
      }
    });
}

const ADD_SCHEMA = discordWebhookSchema("add");
const EDIT_SCHEMA = discordWebhookSchema("edit");

/** The server's single `detail` string for a 409/422, else a generic fallback. */
function serverErrorFrom(err: AxiosError): string {
  const detail = (err.response?.data as { detail?: unknown } | undefined)
    ?.detail;
  return typeof detail === "string" ? detail : getApiError(err);
}

export function DiscordWebhooksPage() {
  const {
    data: webhooks,
    isLoading,
    isError,
    refetch,
  } = useAdminDiscordWebhooks();
  const createMutation = useCreateDiscordWebhook();
  const updateMutation = useUpdateDiscordWebhook();
  const deleteMutation = useDeleteDiscordWebhook();

  const [addOpen, setAddOpen] = useState(false);
  const [addServerError, setAddServerError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DiscordWebhookRow | null>(null);
  const [editServerError, setEditServerError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addForm = useForm<DiscordWebhookFormValues>({
    resolver: zodResolver(ADD_SCHEMA),
    defaultValues: EMPTY_DISCORD_WEBHOOK_FORM,
  });
  const editForm = useForm<DiscordWebhookFormValues>({
    resolver: zodResolver(EDIT_SCHEMA),
    defaultValues: EMPTY_DISCORD_WEBHOOK_FORM,
  });

  // Server error is cleared on reopen — it belongs to the submission that
  // produced it, never to a fresh open of the same dialog.
  useEffect(() => {
    if (addOpen) {
      setAddServerError(null);
      addForm.reset(EMPTY_DISCORD_WEBHOOK_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen]);

  useEffect(() => {
    if (editTarget) {
      setEditServerError(null);
      editForm.reset(discordWebhookToFormValues(editTarget));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget]);

  const handleCreate = (values: DiscordWebhookFormValues) => {
    const label = values.label.trim();
    const payload: CreateDiscordWebhook = {
      webhook_url: values.webhook_url.trim(),
      guild_id: values.guild_id.trim(),
      role_ids: parseRoleIds(values.role_ids),
      label: label ? label : undefined,
    };
    createMutation.mutate(payload, {
      onSuccess: () => setAddOpen(false),
      onError: (err: AxiosError) => setAddServerError(serverErrorFrom(err)),
    });
  };

  const handleUpdate = (values: DiscordWebhookFormValues) => {
    if (!editTarget) return;
    const dirty = editForm.formState.dirtyFields;
    const payload: UpdateDiscordWebhook = {};
    if (dirty.webhook_url && values.webhook_url.trim()) {
      payload.webhook_url = values.webhook_url.trim();
    }
    if (dirty.guild_id) {
      payload.guild_id = values.guild_id.trim();
    }
    if (dirty.role_ids) {
      payload.role_ids = parseRoleIds(values.role_ids);
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

  const handleDelete = (row: DiscordWebhookRow) => {
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
          Discord webhooks
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Reports are posted to every webhook whose server the author is in.
          Role ids limit a webhook to members holding at least one of them.
        </p>
      </motion.div>

      <DiscordWebhookList
        webhooks={webhooks}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onAdd={() => setAddOpen(true)}
        onEdit={(row) => setEditTarget(row)}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

      <DiscordWebhookFormDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        form={addForm}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        serverError={addServerError}
      />

      <DiscordWebhookFormDialog
        mode="edit"
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        form={editForm}
        onSubmit={handleUpdate}
        isPending={updateMutation.isPending}
        serverError={editServerError}
        currentUrlMasked={editTarget?.webhook_url_masked ?? null}
      />
    </div>
  );
}
