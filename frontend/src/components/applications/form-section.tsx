import { type ComponentType, type ReactNode } from "react";
import { type LucideProps } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  /** Section title (e.g. "Role & company", "Details", "Posting & notes"). */
  title: ReactNode;
  /** Optional supporting copy under the title. */
  description?: ReactNode;
  /** Optional Lucide icon shown in a tinted tile beside the title. */
  icon?: ComponentType<LucideProps>;
  /** The grouped fields. Wrap grids/rows as needed. */
  children: ReactNode;
  /** Optional footer, typically a Save action. Right-aligned with a top border. */
  footer?: ReactNode;
  /** Heading level for the title — keep the document outline correct. */
  as?: "h2" | "h3";
  className?: string;
  /** Extra classes for the content region (e.g. grid layout). */
  contentClassName?: string;
}

/**
 * Card shell for a titled group of form fields. Presentational only: the
 * parent owns the `<form>`, the fields and any action passed via `footer`.
 */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  footer,
  as: Heading = "h2",
  className,
  contentClassName,
}: FormSectionProps) {
  return (
    <Card data-slot="form-section" className={cn("gap-0 py-0", className)}>
      {/* `[.border-b]:pb-5`: CardHeader's own `[.border-b]:pb-6` outranks `p-5`. */}
      <CardHeader className="flex flex-row items-start gap-3 border-b p-5 [.border-b]:pb-5">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon aria-hidden className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          <Heading
            data-slot="card-title"
            className="font-display text-base leading-none font-semibold tracking-tight"
          >
            {title}
          </Heading>
          {description ? (
            <CardDescription className="text-pretty">
              {description}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className={cn("p-5", contentClassName)}>
        {children}
      </CardContent>

      {footer ? (
        <CardFooter className="justify-end gap-2 border-t p-5 [.border-t]:pt-5">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
