"use client";

import { useCallback, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CV_COLLAPSIBLE_CONTENT_CLASS,
  CvSectionCard,
  type CvCollapsibleProps,
} from "@/components/base-cvs/cv-section-card";
import { cn } from "@/lib/utils";

/** What a rendered row gets so it can edit its own item. */
export interface CvRepeatableItemContext<T> {
  item: T;
  index: number;
  /** Shallow-merges a patch into this item. */
  update: (patch: Partial<T>) => void;
}

export interface CvRepeatableSectionProps<
  T extends { id: string },
> extends CvCollapsibleProps {
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
  /**
   * Makes every ROW its own disclosure. Rows open on load and a row added
   * later is born open; the section remembers only what the user CLOSED.
   */
  collapsibleItems?: boolean;
  /**
   * Row ids that must be OPEN right now — the seam a caller drives when a
   * submit found an error inside a collapsed row. Reopening is one-way: the
   * user may close the row again afterwards.
   */
  revealItemIds?: readonly string[];
  /**
   * Moves whenever the caller wants `revealItemIds` honoured AGAIN, even
   * though the ids did not change — the form passes its submit count, so the
   * second submit that fails on the same rows re-opens them too (AC6).
   */
  revealNonce?: string | number;
  /** Fired with the next state when a row's own trigger is pressed. */
  onItemOpenChange?: (item: T, open: boolean) => void;
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
 *
 * Reorder is an ARROW and disclosure is a CHEVRON, deliberately: with
 * `collapsibleItems` a row header carries both, and two chevron pairs in one
 * 200px row would be unreadable. The disclosure also sits on the LEFT, wrapping
 * the row label, while move and remove stay right — different icon family,
 * different side, different accessible names.
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
  collapsibleItems = false,
  revealItemIds,
  revealNonce = "",
  onItemOpenChange,
  footer,
  className,
  collapsible,
  defaultOpen,
  open,
  onOpenChange,
}: CvRepeatableSectionProps<T>) {
  const atMax = max != null && items.length >= max;
  const canAdd = !disabled && !atMax;

  // Open is the ABSENCE of an entry, so a row the user has never touched — and
  // every row added later — starts expanded with nothing to seed it.
  //
  // The set is stamped with the reveal it was recorded against, and a reveal is
  // COMMITTED during render rather than derived for as long as the error lasts.
  // Deriving it collapsed the row again the instant the last invalid field
  // became valid: the error cleared, the reveal with it, and the stored
  // "closed" folded away a row the user was still typing in — an unrequested
  // context change on input (WCAG 3.2.2) that took keyboard focus to `<body>`
  // with it. A revealed row now stays open until the USER closes it.
  //
  // The commit is React's "adjust state when a prop changes" pattern: it
  // re-renders immediately and converges on the next pass, because the stamp
  // then matches. Never an effect — `react-hooks/set-state-in-effect` is an
  // error under the React Compiler config, and an effect would paint the
  // collapsed frame first.
  const revealKey = `${revealNonce}\u0000${revealItemIds?.join("\u0000") ?? ""}`;

  // Seeded with the CURRENT key, not `""`: no row is closed at mount, so the
  // prune there is provably a no-op, and seeding a key that can never match
  // would buy a guaranteed second render pass on every mount for nothing.
  const [closedItems, setClosedItems] = useState<{
    revealKey: string;
    ids: ReadonlySet<string>;
  }>(() => ({ revealKey, ids: new Set<string>() }));

  if (closedItems.revealKey !== revealKey) {
    const draft = new Set(closedItems.ids);
    for (const id of revealKey.split("\u0000").slice(1)) {
      if (id) draft.delete(id);
    }
    setClosedItems({ revealKey, ids: draft });
  }

  const closedItemIds = closedItems.ids;

  const setItemOpen = useCallback(
    (id: string, next: boolean) => {
      if (closedItemIds.has(id) === !next) return;
      const draft = new Set(closedItemIds);
      if (next) draft.delete(id);
      else draft.add(id);
      setClosedItems({ revealKey, ids: draft });
    },
    [closedItemIds, revealKey],
  );

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
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
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
              const label = itemLabel
                ? itemLabel(item, index)
                : `#${index + 1}`;
              const isOpen = !closedItemIds.has(item.id);

              const header = (
                <div className="flex items-center justify-between gap-2">
                  {collapsibleItems ? (
                    <CollapsibleTrigger
                      data-slot="cv-item-trigger"
                      // The visible label is the row caption, so the accessible
                      // name must contain it (WCAG 2.5.3); the position makes it
                      // unique when two rows are still called "New role".
                      aria-label={`${label}, ${position}`}
                      className={cn(
                        "group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left",
                        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        "cursor-pointer hover:text-foreground",
                      )}
                    >
                      <ChevronDown
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90"
                      />
                      <span className="truncate text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
                        {label}
                      </span>
                    </CollapsibleTrigger>
                  ) : (
                    <span className="truncate text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
                      {label}
                    </span>
                  )}
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
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${position} down`}
                          disabled={disabled || index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown aria-hidden />
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
              );

              // The gap between header and fields lives INSIDE the body, never
              // as a margin on the header: a collapsed row must leave no strip
              // of dead space, and the animated height has to include it.
              const body = (
                <div className="pt-3">
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
                </div>
              );

              return (
                <li
                  key={item.id}
                  data-slot="cv-repeatable-item"
                  role="group"
                  aria-label={position}
                  className="rounded-lg border border-border bg-surface/60 p-3"
                >
                  {collapsibleItems ? (
                    <Collapsible
                      open={isOpen}
                      onOpenChange={(next) => {
                        setItemOpen(item.id, next);
                        onItemOpenChange?.(item, next);
                      }}
                    >
                      {header}
                      <CollapsibleContent
                        data-slot="cv-item-content"
                        className={CV_COLLAPSIBLE_CONTENT_CLASS}
                      >
                        {body}
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <>
                      {header}
                      {body}
                    </>
                  )}
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
