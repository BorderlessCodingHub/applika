"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * `hint` is said under every keyword field; it is the only place the reorder
 * keys are told (`cvs.fields.keywords.*`, active language). Never spread it.
 */
export const CV_KEYWORDS_COPY = liveCopy("cvs.fields.keywords", ["hint"]);

export interface CvKeywordsInputProps {
  /** Controlled keyword list, in print order. */
  value: string[];
  /** Called with the next list on add, rename, move or remove. */
  onChange: (next: string[]) => void;
  /**
   * Names the list this field belongs to — the skill category. It is folded
   * into the entry's accessible name so a screen reader user knows WHICH
   * category they are typing into when several are on screen.
   */
  groupLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Cap; the entry locks once reached. */
  maxKeywords?: number;
  /** Id of the validation message, so the entry can point at it. */
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

/** Position the component wants focus on after the next render. */
type PendingFocus =
  | { kind: "keyword"; index: number }
  | { kind: "entry" }
  | null;

/**
 * Chip entry for the keywords of ONE skill category. Type and press Enter or
 * comma to add; click (or Enter) a chip to rename it in place; Alt with the
 * left or right arrow moves the focused chip; Backspace on an empty entry
 * removes the last chip, and every chip has its own remove button.
 *
 * Order is part of the CV, so the move is keyboard-operable rather than drag
 * and drop — the same call `CvRepeatableSection` makes for its rows. A wrapping
 * chip row has no room for a pair of move buttons per chip, so the keys are
 * told once under the field and carried on each chip as `aria-keyshortcuts`.
 *
 * Controlled and presentation-only: the parent owns the value and validation.
 */
export function CvKeywordsInput({
  value,
  onChange,
  groupLabel,
  placeholder = "React, Postgres, Terraform…",
  disabled,
  maxKeywords,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: CvKeywordsInputProps) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const pendingFocusRef = useRef<PendingFocus>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = maxKeywords != null && value.length >= maxKeywords;

  const t = useTranslations("cvs.fields.keywords");
  const entryLabel = groupLabel ? t("addTo", { group: groupLabel }) : t("add");

  // Focus is restored after the list has re-rendered with the new value, so
  // the chip a move or a delete should leave the caret on still exists.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if (pending.kind === "entry") {
      inputRef.current?.focus();
      return;
    }
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-keyword-index="${pending.index}"]`,
    );
    (target ?? inputRef.current)?.focus();
  }, [value, editing]);

  const addKeywords = (raw: string) => {
    const candidates = raw
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (candidates.length === 0) {
      setDraft("");
      return;
    }

    const next = [...value];
    for (const candidate of candidates) {
      if (maxKeywords != null && next.length >= maxKeywords) break;
      const exists = next.some(
        (keyword) => keyword.toLowerCase() === candidate.toLowerCase(),
      );
      if (!exists) next.push(candidate);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  const removeAt = (index: number, focusAfter: boolean) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    if (!focusAfter) return;
    if (next.length === 0) pendingFocusRef.current = { kind: "entry" };
    else
      pendingFocusRef.current = {
        kind: "keyword",
        index: Math.min(index, next.length - 1),
      };
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    pendingFocusRef.current = { kind: "keyword", index: target };
  };

  const commitEdit = () => {
    if (editing === null) return;
    const index = editing;
    const trimmed = editDraft.trim();
    setEditing(null);
    if (trimmed === value[index]) {
      pendingFocusRef.current = { kind: "keyword", index };
      return;
    }
    if (!trimmed) {
      removeAt(index, true);
      return;
    }
    const clash = value.some(
      (keyword, i) =>
        i !== index && keyword.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      removeAt(index, true);
      return;
    }
    onChange(value.map((keyword, i) => (i === index ? trimmed : keyword)));
    pendingFocusRef.current = { kind: "keyword", index };
  };

  const handleEntryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addKeywords(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1, false);
    }
  };

  const handleChipKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      move(index, -1);
    } else if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removeAt(index, true);
    }
  };

  return (
    <div
      ref={listRef}
      data-slot="cv-keywords-input"
      aria-invalid={ariaInvalid}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
    >
      <ul
        aria-label={groupLabel ? t("listIn", { group: groupLabel }) : t("list")}
        className="contents"
      >
        {value.map((keyword, index) =>
          editing === index ? (
            <li key={`edit-${index}`} className="contents">
              <input
                autoFocus
                type="text"
                value={editDraft}
                aria-label={t("rename", { keyword })}
                size={Math.max(4, editDraft.length + 1)}
                onChange={(event) => setEditDraft(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitEdit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setEditing(null);
                    pendingFocusRef.current = { kind: "keyword", index };
                  }
                }}
                className="h-6 min-w-16 rounded-md border border-ring bg-background px-1.5 text-sm ring-[3px] ring-ring/50 outline-none"
              />
            </li>
          ) : (
            <li key={`${keyword}-${index}`} className="contents">
              <Badge
                variant="secondary"
                className="gap-0.5 py-0 pr-1 pl-0 font-normal"
              >
                <button
                  type="button"
                  data-keyword-index={index}
                  disabled={disabled}
                  aria-label={t("rename", { keyword })}
                  aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Delete"
                  onClick={() => {
                    setEditDraft(keyword);
                    setEditing(index);
                  }}
                  onKeyDown={(event) => handleChipKeyDown(event, index)}
                  className="rounded-l-md py-0.5 pr-0.5 pl-2 outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50"
                >
                  {keyword}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t("remove", { keyword })}
                  onClick={() => removeAt(index, true)}
                  className="rounded-full p-0.5 outline-none hover:bg-background/60 focus-visible:ring-[2px] focus-visible:ring-ring/50"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </Badge>
            </li>
          ),
        )}
      </ul>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={disabled || atMax}
        aria-label={entryLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        placeholder={value.length === 0 ? placeholder : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleEntryKeyDown}
        onBlur={() => addKeywords(draft)}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (/[,\n]/.test(text)) {
            event.preventDefault();
            addKeywords(text);
          }
        }}
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
