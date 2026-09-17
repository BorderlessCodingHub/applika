"use client";

import { useId, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface CvFieldProps {
  /** Visible label. It is also the control's accessible name (implicit label). */
  label: string;
  /** Adds a decorative required marker. It is CSS content, so it never lands in the name. */
  required?: boolean;
  /** Validation message; replaces the hint. */
  error?: string;
  /** DOM id for the error line, so the control can point at it with `aria-describedby`. */
  errorId?: string;
  /** Helper copy under the control. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A labelled control for the CV editor. The `<label>` WRAPS the control, so the
 * accessible name is exactly `label` with no `htmlFor`/`id` bookkeeping —
 * `getByLabelText("Full name")` finds it. The required marker and the
 * error/hint line sit outside the label text on purpose, so neither leaks into
 * the name. Only for labelable controls; use `CvSelectField` for a Radix Select.
 */
export function CvField({
  label,
  required,
  error,
  errorId,
  hint,
  children,
  className,
}: CvFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block space-y-1.5">
        <span className="flex items-center gap-0.5 text-sm leading-none font-medium">
          {label}
          {required ? (
            <span
              aria-hidden
              className="text-destructive after:content-['*']"
            />
          ) : null}
        </span>
        {children}
      </label>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface CvSelectFieldProps<T extends string> {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly T[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled Radix Select. A `<label for>` cannot name a button, so the visible
 * label is wired with `aria-labelledby` — the accessible name is exactly `label`.
 */
export function CvSelectField<T extends string>({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: CvSelectFieldProps<T>) {
  const labelId = useId();

  return (
    <div className={cn("space-y-1.5", className)}>
      <span id={labelId} className="block text-sm leading-none font-medium">
        {label}
      </span>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onValueChange(next as T)}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface CvStringListFieldProps {
  /** Visible group label (e.g. "Highlights"). */
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Accessible-name stem for each row, e.g. `highlight` -> "Highlight 1". */
  noun: string;
  addLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Editable list of free-text lines (experience highlights). One input per line
 * with a remove control, plus one add control. Separate from `CvSkillsInput`
 * because a highlight is a sentence that may contain commas.
 */
export function CvStringListField({
  label,
  value,
  onChange,
  noun,
  addLabel,
  placeholder,
  disabled,
  className,
}: CvStringListFieldProps) {
  const capitalised = noun.charAt(0).toUpperCase() + noun.slice(1);

  return (
    <div className={cn("space-y-2", className)}>
      <span className="block text-sm leading-none font-medium">{label}</span>
      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                value={entry}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={`${capitalised} ${index + 1}`}
                onChange={(event) =>
                  onChange(
                    value.map((item, i) =>
                      i === index ? event.target.value : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Remove ${noun} ${index + 1}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...value, ""])}
      >
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}
