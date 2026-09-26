"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  InfoIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  PlusIcon,
} from "lucide-react";
import { z } from "zod";

import { OnlyYouBadge } from "@/components/applications/only-you-badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A row either picker (platform or company) reads. */
export interface CatalogOption {
  id: string;
  name: string;
  url: string | null;
  /** `undefined` for a free-text company: it never had a visibility. */
  is_public?: boolean;
}

export interface NewCatalogInput {
  name: string;
  url: string | null;
}

export interface CatalogCopy {
  placeholder: string;
  listLabel: string;
  search: string;
  loading: string;
  noMatch: string;
  createNew: string;
  newTitle: string;
  name: string;
  url: string;
  optional: string;
  /** Company only: shown under the URL input. */
  urlHint?: string;
  privacyHint: string;
  back: string;
  submit: string;
  nameRequired: string;
  nameTooLong: string;
  urlInvalid: string;
  urlTooLong: string;
  createFailed: string;
  nowSelected: string;
}

/**
 * - `created`: a 201 row; selected, no notice.
 * - `reused`: a 200 row (company name+url match); `message` is shown with the
 *   "now selected" suffix.
 * - `exists`: a platform 409; `message` is its `detail`, shown verbatim, and
 *   `option` (looked up by name) is selected when given.
 * - `freeText`: no URL was given (company only); kept as a local-only row,
 *   `message` shown WITHOUT the "now selected" suffix.
 * - `failed`: anything else; the create form stays open and shows `message`.
 */
export type CatalogCreateOutcome =
  | { status: "created"; option: CatalogOption }
  | { status: "reused"; message: string; option: CatalogOption }
  | { status: "exists"; message: string; option?: CatalogOption | null }
  | { status: "freeText"; option: CatalogOption; message: string }
  | { status: "failed"; message: string };

export function createCatalogLabel(name: string, copy: CatalogCopy): string {
  return name ? `Create "${name}"` : copy.createNew;
}

export function alreadyListedMessage(name: string): string {
  return `${name} is already in your list.`;
}

/** Exact, case-insensitive, trimmed match. */
export function findCatalogOptionByName<T extends { name: string }>(
  options: readonly T[],
  name: string,
): T | undefined {
  const query = name.trim().toLowerCase();
  if (!query) return undefined;
  return options.find((option) => option.name.trim().toLowerCase() === query);
}

/** Exact match first, then prefix, then substring; list order within each. */
export function filterCatalogOptions<T extends { name: string }>(
  options: readonly T[],
  search: string,
): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return [...options];
  return options
    .map((option) => {
      const name = option.name.trim().toLowerCase();
      const rank =
        name === query
          ? 0
          : name.startsWith(query)
            ? 1
            : name.includes(query)
              ? 2
              : -1;
      return { option, rank };
    })
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.option);
}

export function validateCatalogInput(
  name: string,
  url: string,
  copy: CatalogCopy,
  limits: { nameMax: number; urlMax: number },
): { name?: string; url?: string } {
  const errors: { name?: string; url?: string } = {};
  if (!name) errors.name = copy.nameRequired;
  else if (name.length > limits.nameMax) errors.name = copy.nameTooLong;
  if (url) {
    if (url.length > limits.urlMax) errors.url = copy.urlTooLong;
    else if (!z.httpUrl().safeParse(url).success) errors.url = copy.urlInvalid;
  }
  return errors;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

export interface CatalogSelectProps {
  kind: "platform" | "company";
  copy: CatalogCopy;
  nameMax: number;
  urlMax: number;
  /** Visible rows. `undefined` while unknown. */
  options: readonly CatalogOption[] | undefined;
  isLoading?: boolean;
  /** Selected id; `""` shows the placeholder. */
  value: string;
  /** A row not (yet) present in `options` — a free-text pick or a just-created row. */
  selectedOption?: CatalogOption | null;
  onValueChange: (id: string, option: CatalogOption) => void;
  /** Debounced 300ms; called with `""` immediately on close. */
  onSearchChange?: (query: string) => void;
  onCreate: (input: NewCatalogInput) => Promise<CatalogCreateOutcome>;
  /**
   * `true` (platform): an exact match replaces "Create" and the create
   * form's submit shortcuts to it. `false` (company): the exact match is
   * ranked first but "Create" stays offered, and the form never shortcuts —
   * the server alone decides reuse (name AND url).
   */
  exactMatchReplacesCreate: boolean;
  disabled?: boolean;
  /** Trigger id, for a `<Label htmlFor>`. */
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  className?: string;
}

type Notice = { message: string; selected: boolean };

/**
 * Searchable, creatable catalog picker (Popover + Command) shared by the
 * platform and company fields. An exact, case-insensitive match is offered
 * instead of Create when `exactMatchReplacesCreate`. `Create "X"` swaps the
 * list for a name + optional URL form; the outcome is reported by `onCreate`.
 * Private rows carry `Only you`. Controlled; owns only open/search/form state.
 */
export function CatalogSelect({
  kind,
  copy,
  nameMax,
  urlMax,
  options,
  isLoading = false,
  value,
  selectedOption = null,
  onValueChange,
  onSearchChange,
  onCreate,
  exactMatchReplacesCreate,
  disabled,
  id,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  className,
}: CatalogSelectProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  // Shown in the trigger until the refetched list carries the new/picked row.
  const [created, setCreated] = useState<CatalogOption | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const backToList = useRef(false);
  const noticeId = useId();

  const list = useMemo(() => options ?? [], [options]);
  const filtered = useMemo(
    () => filterCatalogOptions(list, search),
    [list, search],
  );
  const exactMatch = findCatalogOptionByName(list, search);
  const selected =
    list.find((option) => option.id === value) ??
    selectedOption ??
    (value && created?.id === value ? created : null);

  useEffect(() => {
    if (mode !== "list" || !backToList.current) return;
    backToList.current = false;
    searchRef.current?.focus();
  }, [mode]);

  // Debounced server search; a close flushes it to "" immediately.
  useEffect(() => {
    if (!onSearchChange) return;
    const handle = setTimeout(() => onSearchChange(search), 300);
    return () => clearTimeout(handle);
  }, [search, onSearchChange]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNotice(null);
    } else {
      setMode("list");
      setSearch("");
      onSearchChange?.("");
    }
  };

  const pick = (
    option: CatalogOption,
    message?: string,
    selectedFlag = true,
  ) => {
    onValueChange(option.id, option);
    handleOpenChange(false);
    setNotice(message ? { message, selected: selectedFlag } : null);
  };

  const handleCreate = async (
    input: NewCatalogInput,
  ): Promise<string | null> => {
    const outcome = await onCreate(input);
    if (outcome.status === "failed") return outcome.message;
    if (outcome.status === "created") {
      setCreated(outcome.option);
      pick(outcome.option);
      return null;
    }
    if (outcome.status === "reused") {
      setCreated(outcome.option);
      pick(outcome.option, outcome.message);
      return null;
    }
    if (outcome.status === "freeText") {
      setCreated(outcome.option);
      pick(outcome.option, outcome.message, false);
      return null;
    }
    // exists (platform 409)
    if (outcome.option) {
      setCreated(outcome.option);
      pick(outcome.option, outcome.message);
    } else {
      handleOpenChange(false);
      setNotice({ message: outcome.message, selected: false });
    }
    return null;
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      handleOpenChange(true);
    }
  };

  const describedBy =
    [ariaDescribedby, notice ? noticeId : null].filter(Boolean).join(" ") ||
    undefined;
  const trimmedSearch = search.trim();
  const effectivePlaceholder = placeholder ?? copy.placeholder;

  return (
    <div
      data-slot="catalog-select"
      data-kind={kind}
      className={cn("flex min-w-0 flex-col", className)}
    >
      {/* `modal`: a non-modal popover inside the Sheet cannot scroll; the Sheet's scroll lock eats the wheel. */}
      <Popover open={open} onOpenChange={handleOpenChange} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            id={id}
            disabled={disabled}
            aria-expanded={open}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-describedby={describedBy}
            aria-invalid={ariaInvalid}
            aria-required={ariaRequired}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              "w-full min-w-0 justify-between gap-2 bg-card px-3 font-normal",
              // `dark:border-input` on the shared `outline` Button variant
              // otherwise wins over `aria-invalid:border-destructive` in dark
              // mode (same specificity, later in the compiled stylesheet) —
              // a plain conditional class here beats it through tailwind-merge.
              ariaInvalid && "border-destructive dark:border-destructive",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                data-slot="catalog-select-value"
                className={cn("truncate", !selected && "text-muted-foreground")}
              >
                {selected ? selected.name : effectivePlaceholder}
              </span>
              {selected && selected.is_public === false ? (
                <>
                  <span className="sr-only">, </span>
                  <OnlyYouBadge />
                </>
              ) : null}
            </span>
            <ChevronsUpDownIcon aria-hidden className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={mode === "list" ? copy.listLabel : copy.newTitle}
          // No available-height clamp: a clamped box never overflows, so it never flips when the create form grows.
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        >
          {mode === "list" ? (
            // `label`, not `aria-label` on the input: cmdk points the input's `aria-labelledby` at its own label.
            <Command label={copy.search} shouldFilter={false} loop>
              <CommandInput
                ref={searchRef}
                placeholder={copy.search}
                value={search}
                onValueChange={setSearch}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="search"
                // 16px below md: iOS zooms the page into a smaller focused input.
                className="text-base md:text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Home" || event.key === "End") {
                    event.stopPropagation();
                  }
                }}
              />
              {isLoading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <LoaderCircleIcon
                    aria-hidden
                    className="size-4 motion-safe:animate-spin"
                  />
                  {copy.loading}
                </p>
              ) : trimmedSearch && filtered.length === 0 ? (
                <p className="px-3 pt-3 pb-1 text-sm text-muted-foreground">
                  {copy.noMatch}
                </p>
              ) : null}
              <CommandList className="max-h-72 overscroll-contain">
                {!isLoading && filtered.length > 0 ? (
                  <CommandGroup>
                    {filtered.map((option) => {
                      const isSelected = option.id === value;
                      return (
                        <CommandItem
                          key={option.id}
                          value={option.id}
                          data-checked={isSelected}
                          onSelect={() => pick(option)}
                        >
                          <CheckIcon
                            aria-hidden
                            className={cn(
                              "text-foreground",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{option.name}</span>
                            {option.url ? (
                              <span className="truncate text-xs text-foreground/70">
                                <span className="sr-only">, </span>
                                {displayUrl(option.url)}
                              </span>
                            ) : null}
                          </span>
                          {option.is_public === false ? (
                            <>
                              <span className="sr-only">, </span>
                              <OnlyYouBadge />
                            </>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null}
                {!isLoading && (!exactMatchReplacesCreate || !exactMatch) ? (
                  <>
                    {filtered.length > 0 ? <CommandSeparator /> : null}
                    <CommandGroup>
                      <CommandItem
                        value={`create-new-${kind}`}
                        data-slot="catalog-select-create"
                        onSelect={() => setMode("create")}
                      >
                        <PlusIcon aria-hidden />
                        <span className="truncate">
                          {createCatalogLabel(trimmedSearch, copy)}
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            </Command>
          ) : (
            <CatalogCreateForm
              copy={copy}
              nameMax={nameMax}
              urlMax={urlMax}
              initialName={trimmedSearch}
              options={list}
              exactMatchReplacesCreate={exactMatchReplacesCreate}
              onBack={() => {
                backToList.current = true;
                setMode("list");
              }}
              onExisting={(option) =>
                pick(option, alreadyListedMessage(option.name))
              }
              onCreate={handleCreate}
            />
          )}
        </PopoverContent>
      </Popover>

      <p
        aria-live="polite"
        aria-atomic="true"
        id={noticeId}
        data-slot="catalog-select-notice"
        className={cn(
          "flex items-start gap-1.5 text-xs text-pretty text-foreground",
          notice && "mt-1.5",
        )}
      >
        {notice ? (
          <>
            <InfoIcon
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-primary"
            />
            <span>
              <span>{notice.message}</span>
              {notice.selected ? (
                <span>
                  {/[.!?]$/.test(notice.message) ? " " : ". "}
                  {copy.nowSelected}
                </span>
              ) : null}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function CatalogCreateForm({
  copy,
  nameMax,
  urlMax,
  initialName,
  options,
  exactMatchReplacesCreate,
  onBack,
  onExisting,
  onCreate,
}: {
  copy: CatalogCopy;
  nameMax: number;
  urlMax: number;
  initialName: string;
  options: readonly CatalogOption[];
  exactMatchReplacesCreate: boolean;
  onBack: () => void;
  onExisting: (option: CatalogOption) => void;
  /** Resolves with an error message to show, or `null` once the popover closed. */
  onCreate: (input: NewCatalogInput) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const urlId = useId();
  const hintId = useId();
  const urlHintId = useId();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // Portaled, yet React still bubbles `submit` to the Sheet's own <form>.
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const nextErrors = validateCatalogInput(trimmedName, trimmedUrl, copy, {
      nameMax,
      urlMax,
    });
    setErrors(nextErrors);
    if (nextErrors.name) return nameRef.current?.focus();
    if (nextErrors.url) return urlRef.current?.focus();

    if (exactMatchReplacesCreate) {
      const existing = findCatalogOptionByName(options, trimmedName);
      if (existing) return onExisting(existing);
    }

    setPending(true);
    setFailure(null);
    let message: string | null;
    try {
      message = await onCreate({ name: trimmedName, url: trimmedUrl || null });
    } catch {
      message = copy.createFailed;
    }
    setPending(false);
    if (message) setFailure(message);
  };

  return (
    <form
      aria-labelledby={titleId}
      aria-busy={pending}
      noValidate
      onSubmit={handleSubmit}
      data-slot="catalog-create-form"
      className="flex flex-col gap-3 p-3"
    >
      <h3
        id={titleId}
        className="font-display text-sm font-semibold text-foreground"
      >
        {copy.newTitle}
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{copy.name}</Label>
        <Input
          ref={nameRef}
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
        />
        {errors.name ? (
          <p id={`${nameId}-error`} className="text-xs text-destructive">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={urlId}>
          {copy.url}{" "}
          <span className="font-normal text-muted-foreground">
            {copy.optional}
          </span>
        </Label>
        <Input
          ref={urlRef}
          id={urlId}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={pending}
          autoComplete="off"
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={
            [
              errors.url ? `${urlId}-error` : null,
              copy.urlHint ? urlHintId : hintId,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {errors.url ? (
          <p id={`${urlId}-error`} className="text-xs text-destructive">
            {errors.url}
          </p>
        ) : null}
        {copy.urlHint ? (
          <p id={urlHintId} className="text-xs text-muted-foreground">
            {copy.urlHint}
          </p>
        ) : null}
      </div>

      <p
        id={hintId}
        className="flex items-start gap-1.5 text-xs text-muted-foreground"
      >
        <LockKeyholeIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        {copy.privacyHint}
      </p>

      {failure ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-popover p-2 text-xs text-pretty text-foreground"
        >
          <CircleAlertIcon
            aria-hidden
            className="mt-px size-3.5 shrink-0 text-destructive"
          />
          {failure}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={pending}
        >
          {copy.back}
        </Button>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? (
            <LoaderCircleIcon
              aria-hidden
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : (
            <PlusIcon aria-hidden data-icon="inline-start" />
          )}
          {copy.submit}
        </Button>
      </div>
    </form>
  );
}
