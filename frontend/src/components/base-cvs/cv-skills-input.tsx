"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CvSkillsInputProps {
  /** Controlled tag list. */
  value: string[];
  /** Called with the next list on add or remove. */
  onChange: (next: string[]) => void;
  /** Accessible name of the text entry. */
  inputLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Cap; the entry hides once reached. */
  maxTags?: number;
  /** Id of the validation message, so the entry can point at it. */
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

/**
 * Chip entry for the `skills` string list. Type and press Enter or comma to
 * add; Backspace on an empty entry removes the last chip; every chip has its
 * own remove button. Blank and case-insensitive duplicate entries are dropped,
 * and a pasted comma- or newline-separated list is split.
 *
 * Controlled and presentation-only: the parent owns the value and validation.
 */
export function CvSkillsInput({
  value,
  onChange,
  inputLabel = "Add a skill",
  placeholder = "Add a skill and press Enter",
  disabled,
  maxTags,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: CvSkillsInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = maxTags != null && value.length >= maxTags;

  const addTags = (raw: string) => {
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
      if (maxTags != null && next.length >= maxTags) break;
      const exists = next.some(
        (tag) => tag.toLowerCase() === candidate.toLowerCase(),
      );
      if (!exists) next.push(candidate);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  const removeAt = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      data-slot="cv-skills-input"
      aria-invalid={ariaInvalid}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <ul className="contents">
        {value.map((tag, index) => (
          <li key={`${tag}-${index}`} className="contents">
            <Badge variant="secondary" className="gap-1 pr-1 font-normal">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  removeAt(index);
                }}
                className="rounded-full p-0.5 outline-none hover:bg-background/60 focus-visible:ring-[2px] focus-visible:ring-ring/50"
              >
                <X aria-hidden className="size-3" />
              </button>
            </Badge>
          </li>
        ))}
      </ul>
      {atMax ? null : (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={disabled}
          aria-label={inputLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTags(draft)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[,\n]/.test(text)) {
              event.preventDefault();
              addTags(text);
            }
          }}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
