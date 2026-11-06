"use client";

import { useEffect, useRef } from "react";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DRAFT_STEP_NUMBER,
  DRAFT_STEPS,
  stepLabel,
  type DraftStep,
} from "@/components/application-drafts/draft-copy";
import { cn } from "@/lib/utils";

export interface DraftStepperProps {
  step: DraftStep;
  onStepChange: (step: DraftStep) => void;
  /** Step 2 opens only once the draft exists. */
  canOpenCv: boolean;
  /** Company, role and platform are set. */
  applicationComplete?: boolean;
  /** The draft has a CV copy. */
  cvComplete?: boolean;
  className?: string;
}

/**
 * Two-step indicator for `/applications/new-with-cv`. Each step is a button;
 * the current one carries `aria-current="step"`. After a step change (not on
 * mount) focus moves to the new current step, so keyboard and screen reader
 * users land at the top of the new step.
 */
export function DraftStepper({
  step,
  onStepChange,
  canOpenCv,
  applicationComplete = false,
  cvComplete = false,
  className,
}: DraftStepperProps) {
  const buttons = useRef<Partial<Record<DraftStep, HTMLButtonElement | null>>>(
    {},
  );
  const previous = useRef(step);
  // Subscribes to the language; `stepLabel` reads it at call time.
  const t = useTranslations("drafts");

  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    buttons.current[step]?.focus();
  }, [step]);

  return (
    <nav
      aria-label={t("page.stepsLabel")}
      data-slot="draft-stepper"
      className={cn("w-full max-w-xl", className)}
    >
      <ol className="flex items-center gap-3">
        {DRAFT_STEPS.map((item, index) => {
          const current = item === step;
          const complete =
            item === "application" ? applicationComplete : cvComplete;
          const disabled = item === "cv" && !canOpenCv;
          const number = DRAFT_STEP_NUMBER[item];
          const title = t(`steps.${item}.title`);
          const hint = t(`steps.${item}.hint`);

          return (
            <li
              key={item}
              className={cn(
                "flex min-w-0 items-center gap-3",
                index > 0 && "flex-1",
              )}
            >
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-6 flex-1 transition-colors",
                    applicationComplete ? "bg-primary/60" : "bg-border-strong",
                  )}
                />
              ) : null}
              <button
                ref={(node) => {
                  buttons.current[item] = node;
                }}
                type="button"
                data-step={item}
                aria-label={stepLabel(item)}
                aria-current={current ? "step" : undefined}
                disabled={disabled}
                onClick={() => onStepChange(item)}
                className="group flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border font-numeric text-xs font-semibold transition-colors",
                    current
                      ? "border-primary bg-primary text-primary-foreground"
                      : complete
                        ? "border-primary/40 bg-primary-muted text-primary"
                        : "border-border-strong text-foreground/70 group-enabled:group-hover:border-foreground/40",
                  )}
                >
                  {complete && !current ? (
                    <CheckIcon aria-hidden className="size-3.5" />
                  ) : (
                    number
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      current ? "text-foreground" : "text-foreground/70",
                    )}
                  >
                    {title}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
