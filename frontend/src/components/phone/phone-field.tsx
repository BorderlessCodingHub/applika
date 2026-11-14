"use client";

import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface FieldWiring {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

export interface PhoneFieldProps {
  label: ReactNode;
  /** The control's id; generated when absent. Give it here, never on the control. */
  id?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** One `PhoneInput` or `PhoneTextarea`. */
  children: ReactNode;
}

export function PhoneField({
  label,
  id,
  hint,
  error,
  className,
  children,
}: PhoneFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== null && error !== false;
  const describedBy =
    [hint !== undefined ? hintId : null, hasError ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div data-slot="phone-field" className={cn("ph-field", className)}>
      <label htmlFor={controlId} className="ph-lbl">
        {label}
      </label>
      <FieldContext.Provider
        value={{ id: controlId, describedBy, invalid: hasError }}
      >
        {children}
      </FieldContext.Provider>
      {hint !== undefined ? (
        <p id={hintId} className="ph-hint">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p
          id={errorId}
          data-slot="phone-field-error"
          className="ph-hint text-(color:--destructive-text)"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldWiring() {
  const field = useContext(FieldContext);
  return {
    id: field?.id,
    "aria-describedby": field?.describedBy,
    "aria-invalid": field?.invalid || undefined,
  };
}

export function PhoneInput({ className, ...props }: ComponentProps<"input">) {
  const wiring = useFieldWiring();
  return <input {...wiring} className={cn("ph-input", className)} {...props} />;
}

export function PhoneTextarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  const wiring = useFieldWiring();
  return (
    <textarea {...wiring} className={cn("ph-input", className)} {...props} />
  );
}
