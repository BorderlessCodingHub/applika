"use client";

import { useId } from "react";
import { CheckIcon, MinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useJobsCopy } from "@/components/jobs/job-copy";
import { cn } from "@/lib/utils";

export interface FitKeywordsProps {
  matched: readonly string[];
  missing: readonly string[];
  className?: string;
}

/** The two labelled keyword lists of one CV's fit: "Matched" and "Missing". */
export function FitKeywords({ matched, missing, className }: FitKeywordsProps) {
  return (
    <div
      data-slot="fit-keywords"
      className={cn("flex flex-col gap-3", className)}
    >
      <KeywordGroup kind="matched" keywords={matched} />
      <KeywordGroup kind="missing" keywords={missing} />
    </div>
  );
}

/** The words are read at render (`useJobsCopy`), never here: a module-level read would freeze them. */
const GROUP = {
  matched: {
    label: "matched",
    empty: "noneMatched",
    icon: CheckIcon,
    chip: "border-transparent bg-success/10 text-foreground [&>svg]:text-success",
  },
  missing: {
    label: "missing",
    empty: "noneMissing",
    icon: MinusIcon,
    chip: "border-dashed border-border-strong bg-transparent text-foreground/80 [&>svg]:text-muted-foreground",
  },
} as const;

function KeywordGroup({
  kind,
  keywords,
}: {
  kind: keyof typeof GROUP;
  keywords: readonly string[];
}) {
  const copy = useJobsCopy();
  const labelId = useId();
  const { icon: Icon, chip } = GROUP[kind];
  const label = copy[GROUP[kind].label];
  const empty = copy[GROUP[kind].empty];

  return (
    <div data-slot="fit-keyword-group" data-kind={kind}>
      <p className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-muted-foreground">
        <span id={labelId}>{label}</span>
        <span aria-hidden className="font-numeric">
          {keywords.length}
        </span>
      </p>
      {keywords.length === 0 ? (
        <p className="text-sm text-foreground/70">{empty}</p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li key={keyword} className="max-w-full min-w-0">
              <Badge
                variant="outline"
                className={cn("max-w-full gap-1 font-normal", chip)}
              >
                <Icon aria-hidden />
                <span className="truncate">{keyword}</span>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
