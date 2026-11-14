import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FormSectionProps {
  /** Section title (e.g. "Role & company", "Details", "Posting & notes"). */
  title: ReactNode;
  /** Optional muted supporting copy under the title. */
  description?: ReactNode;
  /** The grouped fields, one row per child; rows are spaced by the content region. */
  children: ReactNode;
  /** Optional footer, typically a Save action. Right-aligned under the fields. */
  footer?: ReactNode;
  /** Heading level for the title — keep the document outline correct. */
  as?: "h2" | "h3";
  className?: string;
  /** Extra classes for the content region; it is already a `gap-3` column. */
  contentClassName?: string;
}

/**
 * A flat, titled group of form fields: no card, no icon. Consecutive sections
 * are separated by a hairline and whitespace, so a stack of them reads as one
 * continuous form. Presentational only: the parent owns the `<form>`, the
 * fields and any action passed via `footer`.
 */
export function FormSection({
  title,
  description,
  children,
  footer,
  as: Heading = "h2",
  className,
  contentClassName,
}: FormSectionProps) {
  return (
    <section
      data-slot="form-section"
      className={cn(
        "flex min-w-0 flex-col gap-4",
        "[[data-slot=form-section]+&]:border-t [[data-slot=form-section]+&]:border-border/60 [[data-slot=form-section]+&]:pt-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Heading
          data-slot="form-section-title"
          className="font-display text-base leading-snug font-semibold tracking-tight text-foreground"
        >
          {title}
        </Heading>
        {description ? (
          <p
            data-slot="form-section-description"
            className="text-sm text-pretty text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>

      <div
        data-slot="form-section-content"
        className={cn("flex min-w-0 flex-col gap-3", contentClassName)}
      >
        {children}
      </div>

      {footer ? (
        <div data-slot="form-section-footer" className="flex justify-end gap-2">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
