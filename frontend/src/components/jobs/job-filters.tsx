"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownUpIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useJobsCopy,
  MIN_FIT_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  advancedJobFilterCount,
  clearJobFilters,
  hasAnyJobFilter,
  minFitOptionLabel,
  moreFiltersLabel,
  postedWithinOptionLabel,
  removeTagLabel,
} from "@/components/jobs/job-copy";
import {
  JOB_FILTER_LIMITS,
  JOB_SOURCES,
  type JobFilters,
  type JobSort,
  type JobSourceRef,
} from "@/services/types/jobs";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";
const ANY = "any";

export interface JobFiltersToolbarProps {
  /** Controlled. The page reads it from the URL and writes `onChange` back there. */
  value: JobFilters;
  onChange: (next: JobFilters) => void;
  /** `false` while the user has no master CV: "Minimum fit" is disabled (R-015). */
  fitAvailable?: boolean;
  /**
   * `false` without the `cvs` feature: no sort control (newest is the only
   * order) and no "Minimum fit" field. The page clears both from the filters.
   */
  showFit?: boolean;
  sources?: readonly JobSourceRef[];
  /** Left end of the bottom row, e.g. `<JobResultsCount>`. */
  summary?: ReactNode;
  className?: string;
}

/**
 * The /jobs toolbar, ported from Ían's `job-filters.tsx`: search, source, sort
 * and a "More filters" panel (tags, minimum fit, published within), then the
 * count, "Clear all filters" and "Show dismissed". Search is debounced here;
 * every other control calls `onChange` at once.
 */
export function JobFiltersToolbar({
  value,
  onChange,
  fitAvailable = true,
  showFit = true,
  sources = JOB_SOURCES,
  summary,
  className,
}: JobFiltersToolbarProps) {
  const copy = useJobsCopy();
  const ids = {
    panel: useId(),
    tags: useId(),
    tagsHint: useId(),
    minFit: useId(),
    minFitHint: useId(),
    posted: useId(),
    dismissed: useId(),
  };

  const committedSearch = value.search ?? "";
  const [searchText, setSearchText] = useState(committedSearch);
  const [seenSearch, setSeenSearch] = useState(committedSearch);
  // A saved search or "Clear all filters" replaces the text; our own debounced commit does not.
  if (committedSearch !== seenSearch) {
    setSeenSearch(committedSearch);
    if (committedSearch !== searchText.trim()) setSearchText(committedSearch);
  }

  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    const next = searchText.trim();
    if (next === (latest.current.value.search ?? "")) return;
    const timer = window.setTimeout(() => {
      const { value: current, onChange: emit } = latest.current;
      emit({ ...current, search: next || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  function flushSearch() {
    const next = searchText.trim();
    if (next !== committedSearch) onChange({ ...value, search: next || null });
  }

  const advancedCount = advancedJobFilterCount(value);
  const [panelOpen, setPanelOpen] = useState(() => advancedCount > 0);

  const [tagText, setTagText] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagsFull = value.tags.length >= JOB_FILTER_LIMITS.tagsMax;

  function addTags(raw: string) {
    setTagText("");
    const next = [...value.tags];
    for (const part of raw.split(",")) {
      const tag = part.trim().slice(0, JOB_FILTER_LIMITS.tagMax);
      if (!tag || next.includes(tag)) continue;
      if (next.length >= JOB_FILTER_LIMITS.tagsMax) break;
      next.push(tag);
    }
    if (next.length !== value.tags.length) onChange({ ...value, tags: next });
  }

  function removeTag(tag: string) {
    onChange({ ...value, tags: value.tags.filter((item) => item !== tag) });
    tagInputRef.current?.focus();
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagText);
    } else if (
      event.key === "Backspace" &&
      tagText === "" &&
      value.tags.length > 0
    ) {
      removeTag(value.tags[value.tags.length - 1]);
    }
  }

  const sourceOptions =
    value.source && !sources.some((source) => source.code === value.source)
      ? [...sources, { code: value.source, name: value.source }]
      : sources;
  const minFitOptions = withCurrent(MIN_FIT_OPTIONS, value.min_fit);
  const postedOptions = withCurrent(
    POSTED_WITHIN_OPTIONS,
    value.posted_within_days,
  );

  return (
    <div
      role="search"
      aria-label={copy.filtersLabel}
      data-slot="job-filters"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            enterKeyHint="search"
            aria-label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            maxLength={JOB_FILTER_LIMITS.searchMax}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") flushSearch();
            }}
            onBlur={flushSearch}
            className="h-11 pl-10"
          />
        </div>

        <Select
          value={value.source ?? ALL}
          onValueChange={(next) =>
            onChange({ ...value, source: next === ALL ? null : next })
          }
        >
          <SelectTrigger
            aria-label={copy.sourceLabel}
            className="order-2 h-11 min-w-0 flex-1 data-[size=default]:h-11 sm:order-none sm:w-44 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{copy.allSources}</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source.code} value={source.code}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {showFit ? (
          <Select
            value={value.sort}
            onValueChange={(next) =>
              onChange({ ...value, sort: next as JobSort })
            }
          >
            <SelectTrigger
              aria-label={copy.sortLabel}
              className="order-2 h-11 min-w-0 flex-1 data-[size=default]:h-11 *:data-[slot=select-value]:flex-1 sm:order-none sm:w-40 sm:flex-none"
            >
              <ArrowDownUpIcon aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="newest">{copy.sortNewest}</SelectItem>
                <SelectItem value="fit">{copy.sortFit}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}

        <Button
          type="button"
          variant={panelOpen || advancedCount > 0 ? "secondary" : "outline"}
          size="icon"
          aria-label={moreFiltersLabel(advancedCount)}
          aria-expanded={panelOpen}
          aria-controls={ids.panel}
          onClick={() => setPanelOpen((open) => !open)}
          className="relative order-1 size-11 sm:order-none"
        >
          <SlidersHorizontalIcon aria-hidden />
          {advancedCount > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground font-numeric text-[0.6875rem] text-background"
            >
              {advancedCount}
            </span>
          ) : null}
        </Button>
      </div>

      {panelOpen ? (
        <div
          id={ids.panel}
          data-slot="job-filters-panel"
          className={cn(
            "grid animate-fade-in-up gap-4 rounded-xl border bg-card p-4 shadow-card motion-reduce:animate-none",
            showFit
              ? "sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]"
              : "sm:grid-cols-[minmax(0,1fr)_12rem]",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1.5",
              showFit && "sm:col-span-2 lg:col-span-1",
            )}
          >
            <Label htmlFor={ids.tags}>{copy.tagsLabel}</Label>
            <Input
              ref={tagInputRef}
              id={ids.tags}
              value={tagText}
              readOnly={tagsFull}
              placeholder={tagsFull ? undefined : copy.tagsPlaceholder}
              maxLength={JOB_FILTER_LIMITS.tagMax}
              aria-describedby={ids.tagsHint}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTagText(event.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => {
                if (tagText.trim()) addTags(tagText);
              }}
              className="read-only:bg-muted/40"
            />
            <p id={ids.tagsHint} className="text-xs text-muted-foreground">
              {tagsFull ? copy.tagsFull : copy.tagsHint}
            </p>
            {value.tags.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {value.tags.map((tag) => (
                  <li key={tag} className="max-w-full min-w-0">
                    <Badge
                      variant="secondary"
                      className="h-7 max-w-full gap-0.5 overflow-visible pr-0.5 pl-2.5 font-normal"
                    >
                      <span className="truncate">{tag}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={removeTagLabel(tag)}
                        onClick={() => removeTag(tag)}
                        className="rounded-full"
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {showFit ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={ids.minFit}>{copy.minFitLabel}</Label>
              <Select
                disabled={!fitAvailable}
                value={value.min_fit == null ? ANY : String(value.min_fit)}
                onValueChange={(next) =>
                  onChange({
                    ...value,
                    min_fit: next === ANY ? null : Number(next),
                  })
                }
              >
                <SelectTrigger
                  id={ids.minFit}
                  aria-describedby={fitAvailable ? undefined : ids.minFitHint}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={ANY}>{copy.anyFit}</SelectItem>
                    {minFitOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {minFitOptionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {fitAvailable ? null : (
                <p
                  id={ids.minFitHint}
                  className="text-xs text-muted-foreground"
                >
                  {copy.minFitNeedsCv}
                </p>
              )}
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={ids.posted}>{copy.postedWithinLabel}</Label>
            <Select
              value={
                value.posted_within_days == null
                  ? ANY
                  : String(value.posted_within_days)
              }
              onValueChange={(next) =>
                onChange({
                  ...value,
                  posted_within_days: next === ANY ? null : Number(next),
                })
              }
            >
              <SelectTrigger id={ids.posted}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ANY}>{copy.anyTime}</SelectItem>
                  {postedOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {postedWithinOptionLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
        {summary}
        {hasAnyJobFilter(value) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(clearJobFilters(value))}
            className="text-muted-foreground"
          >
            <XIcon aria-hidden data-icon="inline-start" />
            {copy.clearAllFilters}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id={ids.dismissed}
            checked={value.include_dismissed}
            onCheckedChange={(checked) =>
              onChange({ ...value, include_dismissed: checked })
            }
          />
          <Label
            htmlFor={ids.dismissed}
            className="font-normal text-foreground/80"
          >
            {copy.showDismissed}
          </Label>
        </div>
      </div>
    </div>
  );
}

function withCurrent(
  options: readonly number[],
  current: number | null,
): number[] {
  if (current == null || options.includes(current)) return [...options];
  return [...options, current].sort((a, b) => a - b);
}
