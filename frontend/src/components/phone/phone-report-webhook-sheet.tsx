"use client";

import { useId } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";

import {
  toggleBadge,
  type ReportWebhookFormDialogProps,
} from "@/components/admin/report-webhook-form-dialog";
import {
  MEMBERSHIP_BADGE_KEYS,
  MEMBERSHIP_BADGE_LABEL,
} from "@/components/badges/membership-badge";
import { PhoneCheckOption } from "@/components/phone/phone-check-option";
import {
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";

function ids(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ") || undefined;
}

/**
 * v3/AdminWebhook's add and edit sheet (l.103-138) below md, with today's
 * `ReportWebhookFormDialog` props, so the page swaps one for the other: the
 * same form, zod schema, submit and server refusal. The stored URL is a
 * secret: the field opens blank, and the edit shows only its masked form.
 */
export function PhoneReportWebhookSheet({
  mode,
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending = false,
  serverError = null,
  currentUrlMasked = null,
}: ReportWebhookFormDialogProps) {
  const t = useTranslations("admin.webhooks.form");
  const id = useId();
  const urlId = `${id}-url`;
  const currentId = `${id}-current`;
  const urlHelpId = `${id}-url-h`;
  const urlErrorId = `${id}-url-e`;
  const badgesHelpId = `${id}-badges-h`;
  const badgesErrorId = `${id}-badges-e`;
  const labelId = `${id}-label`;
  const labelHelpId = `${id}-label-h`;
  const labelErrorId = `${id}-label-e`;
  const errors = form.formState.errors;
  const urlError = errors.webhook_url?.message;
  const labelError = errors.label?.message;
  const showCurrent = mode === "edit" && !!currentUrlMasked;

  return (
    <PhoneSheetFrame
      open={open}
      described
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <span className="ph-grab" aria-hidden="true" />
      <PhoneSheetTitle className="ph-h2 ph-wh-sheet-h">
        {t(`${mode}.title`)}
      </PhoneSheetTitle>
      <PhoneSheetDescription className="ph-hint ph-wh-sheet-d">
        {t(`${mode}.description`)}
      </PhoneSheetDescription>

      <form
        noValidate
        data-slot="report-webhook-form"
        data-mode={mode}
        className="ph-scroll ph-wh-form"
        onSubmit={(event) => {
          if (isPending) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <div className="ph-field">
          <label htmlFor={urlId} className="ph-lbl">
            {t("urlLabel")}
          </label>
          <input
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t(`${mode}.urlPlaceholder`)}
            aria-describedby={ids(
              showCurrent && currentId,
              urlHelpId,
              urlError && urlErrorId,
            )}
            aria-invalid={urlError ? true : undefined}
            className="ph-input"
            {...form.register("webhook_url")}
          />
          {showCurrent ? (
            <p id={currentId} className="ph-hint">
              {t("urlCurrent")}{" "}
              <span
                data-slot="report-webhook-url-current"
                className="ph-mono ph-wh-current-url"
              >
                {currentUrlMasked}
              </span>
            </p>
          ) : null}
          <p id={urlHelpId} className="ph-hint">
            {t("urlHelp")}
          </p>
          {urlError ? (
            <p
              id={urlErrorId}
              data-slot="phone-field-error"
              className="ph-hint ph-wh-error"
            >
              {urlError}
            </p>
          ) : null}
        </div>

        <Controller
          control={form.control}
          name="badges"
          render={({ field, fieldState }) => (
            <fieldset
              data-slot="report-webhook-badge-options"
              aria-describedby={ids(
                badgesHelpId,
                fieldState.error && badgesErrorId,
              )}
              className="ph-wh-badges"
            >
              <legend className="ph-lbl ph-wh-legend">{t("badgeLabel")}</legend>
              {MEMBERSHIP_BADGE_KEYS.map((key) => (
                <PhoneCheckOption
                  key={key}
                  data-badge={key}
                  checked={field.value.includes(key)}
                  onCheckedChange={(on) =>
                    field.onChange(toggleBadge(field.value, key, on))
                  }
                  onBlur={field.onBlur}
                  invalid={!!fieldState.error}
                  label={MEMBERSHIP_BADGE_LABEL[key]}
                  description={t(`badgeHint.${key}`)}
                />
              ))}
              <p id={badgesHelpId} className="ph-hint">
                {t("badgeHelp")}
              </p>
              {fieldState.error?.message ? (
                <p
                  id={badgesErrorId}
                  data-slot="phone-field-error"
                  className="ph-hint ph-wh-error"
                >
                  {fieldState.error.message}
                </p>
              ) : null}
            </fieldset>
          )}
        />

        <div className="ph-field">
          <label htmlFor={labelId} className="ph-lbl">
            {t("labelLabel")}
          </label>
          <input
            id={labelId}
            maxLength={100}
            autoComplete="off"
            placeholder={t("labelPlaceholder")}
            aria-describedby={ids(labelHelpId, labelError && labelErrorId)}
            aria-invalid={labelError ? true : undefined}
            className="ph-input"
            {...form.register("label")}
          />
          <p id={labelHelpId} className="ph-hint">
            {t("labelHelp")}
          </p>
          {labelError ? (
            <p
              id={labelErrorId}
              data-slot="phone-field-error"
              className="ph-hint ph-wh-error"
            >
              {labelError}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <div
            role="alert"
            data-slot="report-webhook-form-error"
            data-tone="error"
            className="ph-notice"
          >
            <CircleAlert
              size={16}
              aria-hidden="true"
              className="ph-notice-ic"
            />
            <p>{serverError}</p>
          </div>
        ) : null}

        <div className="ph-wh-actions">
          {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
          <button
            type="button"
            aria-disabled={isPending || undefined}
            data-disabled={isPending || undefined}
            className="ph-btn ph-sec"
            onClick={() => {
              if (!isPending) onOpenChange(false);
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            aria-disabled={isPending || undefined}
            aria-busy={isPending || undefined}
            data-disabled={isPending || undefined}
            data-action="save-webhook"
            className="ph-btn ph-pri"
          >
            {isPending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {t(`${mode}.submit`)}
          </button>
        </div>
      </form>
    </PhoneSheetFrame>
  );
}
