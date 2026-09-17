"use client";

import type { ComponentType, ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { cn } from "@/lib/utils";

/** What a rendered row gets so it can edit its own item. */
export interface CvRepeatableItemContext<T> {
  item: T;
  index: number;
  /** Shallow-merges a patch into this item. */
  update: (patch: Partial<T>) => void;
}

export interface CvRepeatableSectionProps<T extends { id: string }> {
  title: string;
  description?: ReactNode;
  icon?: ComponentType<LucideProps>;
  /** Controlled list. Rows are keyed by the client-generated `item.id`. */
  items: T[];
  /** Called with the next list on add, remove, move or edit. */
  onChange: (next: T[]) => void;
  /** Factory for a blank item. The caller owns id generation. */
  createItem: () => T;
  /** Renders the fields of one row. */
  renderItem: (context: CvRepeatableItemContext<T>) => ReactNode;
  /** Visible text and accessible name of the add control, e.g. "Add experience". */
  addLabel: string;
  /** Lowercase singular used to build row and control names, e.g. "experience". */
  itemNoun: string;
  /** Per-row caption; defaults to `#{index + 1}`. */
  itemLabel?: (item: T, index: number) => string;
  /** Copy shown when the list is empty. */
  emptyHint: string;
  /** Optional cap; the add control disables once reached. */
  max?: number;
  /** Show the move up/down controls. Defaults to true. */
  reorderable?: boolean;
  /** Disables every control (while saving). */
  disabled?: boolean;
  /** Rendered inside the card under the list — the section's own error line. */
  footer?: ReactNode;
  className?: string;
}

/**
 * The list editor behind links, experience, projects, certifications and
 * languages. A titled card whose body is a controlled list of rows, each with
 * move-up / move-down / remove and a body supplied by `renderItem`.
 *
 * Presentation only and generic: the parent owns the array, the ids and the
 * validation. Order is part of the CV, so reordering is keyboard-operable
 * buttons rather than drag and drop.
 */
export function CvRepeatableSection<T extends { id: string }>({
  title,
  description,
  icon,
  items,
  onChange,
  createItem,
  renderItem,
  addLabel,
  itemNoun,
  itemLabel,
  emptyHint,
  max,
  reorderable = true,
  disabled = false,
  footer,
  className,
}: CvRepeatableSectionProps<T>) {
  const atMax = max != null && items.length >= max;
  const canAdd = !disabled && !atMax;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <CvSectionCard
      title={title}
      description={description}
      icon={icon}
      className={className}
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canAdd}
          onClick={() => onChange([...items, createItem()])}
        >
          <Plus aria-hidden />
          {addLabel}
        </Button>
      }
    >
      <>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-pretty text-muted-foreground">
            {emptyHint}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => {
              const position = `${itemNoun} ${index + 1}`;
              return (
                <li
                  key={item.id}
                  role="group"
                  aria-label={position}
                  className="rounded-lg border border-border bg-surface/60 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
                      {itemLabel ? itemLabel(item, index) : `#${index + 1}`}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {reorderable ? (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${position} up`}
                            disabled={disabled || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ChevronUp aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${position} down`}
                            disabled={disabled || index === items.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ChevronDown aria-hidden />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${position}`}
                        disabled={disabled}
                        onClick={() =>
                          onChange(items.filter((_, i) => i !== index))
                        }
                        className={cn(
                          "text-muted-foreground hover:text-destructive",
                        )}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {renderItem({
                    item,
                    index,
                    update: (patch) =>
                      onChange(
                        items.map((entry, i) =>
                          i === index ? { ...entry, ...patch } : entry,
                        ),
                      ),
                  })}
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </>
    </CvSectionCard>
  );
}
