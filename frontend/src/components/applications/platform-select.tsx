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

/** The fields of a `GET /supports` platform the picker reads. */
export interface PlatformOption {
  id: string;
  name: string;
  url: string | null;
  is_public: boolean;
}

/** `POST /platforms` body. */
export interface NewPlatformInput {
  name: string;
  url: string | null;
}

/**
 * - `created`: the 201 row; it is selected.
 * - `exists`: the 409; `message` is its `detail`, shown verbatim, and `platform`
 *   (looked up by name after refetching) is selected when given.
 * - `failed`: anything else; the create form stays open and shows `message`.
 */
export type PlatformCreateOutcome =
  | { status: "created"; platform: PlatformOption }
  | { status: "exists"; message: string; platform?: PlatformOption | null }
  | { status: "failed"; message: string };

export const PLATFORM_SELECT_COPY = {
  placeholder: "Select a platform",
  listLabel: "Choose a platform",
  search: "Search or add a platform",
  loading: "Loading platforms",
  noMatch: "No platform matches.",
  createNew: "Add a new platform",
  newTitle: "New platform",
  name: "Name",
  url: "URL",
  optional: "(optional)",
  privacyHint: "Only you see it until an admin approves it.",
  back: "Back",
  submit: "Add platform",
  nameRequired: "Name is required",
  nameTooLong: "Name must be 100 characters or fewer",
  urlInvalid: "Enter a full URL, like https://example.com",
  urlTooLong: "URL must be 200 characters or fewer",
  createFailed: "Could not add the platform. Try again.",
  nowSelected: "It is now selected.",
} as const;

const NAME_MAX = 100;
const URL_MAX = 200;
const CREATE_ITEM_VALUE = "create-new-platform";
const httpUrl = z.httpUrl();

export function createPlatformLabel(name: string): string {
  return name ? `Create "${name}"` : PLATFORM_SELECT_COPY.createNew;
}

export function alreadyListedMessage(name: string): string {
  return `${name} is already in your list.`;
}

/** Exact, case-insensitive, trimmed: the rule the server's 409 uses. */
export function findPlatformByName(
  options: readonly PlatformOption[],
  name: string,
): PlatformOption | undefined {
  const query = name.trim().toLowerCase();
  if (!query) return undefined;
  return options.find((option) => option.name.trim().toLowerCase() === query);
}

/** Exact match first, then prefix, then substring; list order within each. */
export function filterPlatforms(
  options: readonly PlatformOption[],
  search: string,
): PlatformOption[] {
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

export function validatePlatformInput(
  name: string,
  url: string,
): { name?: string; url?: string } {
  const errors: { name?: string; url?: string } = {};
  if (!name) errors.name = PLATFORM_SELECT_COPY.nameRequired;
  else if (name.length > NAME_MAX)
    errors.name = PLATFORM_SELECT_COPY.nameTooLong;
  if (url) {
    if (url.length > URL_MAX) errors.url = PLATFORM_SELECT_COPY.urlTooLong;
    else if (!httpUrl.safeParse(url).success)
      errors.url = PLATFORM_SELECT_COPY.urlInvalid;
  }
  return errors;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

export interface PlatformSelectProps {
  /** Visible platforms. `undefined` while unknown. */
  options: readonly PlatformOption[] | undefined;
  isLoading?: boolean;
  /** Selected platform id; `""` shows the placeholder. */
  value: string;
  onValueChange: (platformId: string) => void;
  /** Runs `POST /platforms`; see `PlatformCreateOutcome`. */
  onCreate: (input: NewPlatformInput) => Promise<PlatformCreateOutcome>;
  disabled?: boolean;
  /** Trigger id, for a `<Label htmlFor>`. */
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

type Notice = { message: string; selected: boolean };

/**
 * Searchable, creatable platform picker (Popover + Command). An exact,
 * case-insensitive match is offered instead of Create. `Create "X"` swaps the
 * list for a name + optional URL form; the outcome is reported by `onCreate`.
 * Private rows carry `Only you`. Controlled; owns only open/search/form state.
 */
export function PlatformSelect({
  options,
  isLoading = false,
  value,
  onValueChange,
  onCreate,
  disabled,
  id,
  placeholder = PLATFORM_SELECT_COPY.placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  className,
}: PlatformSelectProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  // Shown in the trigger until the refetched list carries the new row.
  const [created, setCreated] = useState<PlatformOption | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const backToList = useRef(false);
  const noticeId = useId();

  const list = useMemo(() => options ?? [], [options]);
  const filtered = useMemo(() => filterPlatforms(list, search), [list, search]);
  const exactMatch = findPlatformByName(list, search);
  const selected =
    list.find((option) => option.id === value) ??
    (value && created?.id === value ? created : null);

  useEffect(() => {
    if (mode !== "list" || !backToList.current) return;
    backToList.current = false;
    searchRef.current?.focus();
  }, [mode]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNotice(null);
    } else {
      setMode("list");
      setSearch("");
    }
  };

  const pick = (option: PlatformOption, message?: string) => {
    onValueChange(option.id);
    handleOpenChange(false);
    setNotice(message ? { message, selected: true } : null);
  };

  const handleCreate = async (
    input: NewPlatformInput,
  ): Promise<string | null> => {
    const outcome = await onCreate(input);
    if (outcome.status === "failed") return outcome.message;
    if (outcome.status === "created") {
      setCreated(outcome.platform);
      pick(outcome.platform);
      return null;
    }
    if (outcome.platform) {
      setCreated(outcome.platform);
      pick(outcome.platform, outcome.message);
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

  return (
    <div
      data-slot="platform-select"
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
            onKeyDown={onTriggerKeyDown}
            className="w-full min-w-0 justify-between gap-2 bg-card px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                data-slot="platform-select-value"
                className={cn("truncate", !selected && "text-muted-foreground")}
              >
                {selected ? selected.name : placeholder}
              </span>
              {selected && !selected.is_public ? (
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
          aria-label={
            mode === "list"
              ? PLATFORM_SELECT_COPY.listLabel
              : PLATFORM_SELECT_COPY.newTitle
          }
          // No available-height clamp: a clamped box never overflows, so it never flips when the create form grows.
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        >
          {mode === "list" ? (
            // `label`, not `aria-label` on the input: cmdk points the input's `aria-labelledby` at its own label.
            <Command
              label={PLATFORM_SELECT_COPY.search}
              shouldFilter={false}
              loop
            >
              <CommandInput
                ref={searchRef}
                placeholder={PLATFORM_SELECT_COPY.search}
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
                  {PLATFORM_SELECT_COPY.loading}
                </p>
              ) : trimmedSearch && filtered.length === 0 ? (
                <p className="px-3 pt-3 pb-1 text-sm text-muted-foreground">
                  {PLATFORM_SELECT_COPY.noMatch}
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
                          {option.is_public ? null : (
                            <>
                              <span className="sr-only">, </span>
                              <OnlyYouBadge />
                            </>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null}
                {!isLoading && !exactMatch ? (
                  <>
                    {filtered.length > 0 ? <CommandSeparator /> : null}
                    <CommandGroup>
                      <CommandItem
                        value={CREATE_ITEM_VALUE}
                        data-slot="platform-select-create"
                        onSelect={() => setMode("create")}
                      >
                        <PlusIcon aria-hidden />
                        <span className="truncate">
                          {createPlatformLabel(trimmedSearch)}
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            </Command>
          ) : (
            <PlatformCreateForm
              initialName={trimmedSearch}
              options={list}
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
        data-slot="platform-select-notice"
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
                  {PLATFORM_SELECT_COPY.nowSelected}
                </span>
              ) : null}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function PlatformCreateForm({
  initialName,
  options,
  onBack,
  onExisting,
  onCreate,
}: {
  initialName: string;
  options: readonly PlatformOption[];
  onBack: () => void;
  onExisting: (option: PlatformOption) => void;
  /** Resolves with an error message to show, or `null` once the popover closed. */
  onCreate: (input: NewPlatformInput) => Promise<string | null>;
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
    const nextErrors = validatePlatformInput(trimmedName, trimmedUrl);
    setErrors(nextErrors);
    if (nextErrors.name) return nameRef.current?.focus();
    if (nextErrors.url) return urlRef.current?.focus();

    const existing = findPlatformByName(options, trimmedName);
    if (existing) return onExisting(existing);

    setPending(true);
    setFailure(null);
    let message: string | null;
    try {
      message = await onCreate({ name: trimmedName, url: trimmedUrl || null });
    } catch {
      message = PLATFORM_SELECT_COPY.createFailed;
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
      data-slot="platform-create-form"
      className="flex flex-col gap-3 p-3"
    >
      <h3
        id={titleId}
        className="font-display text-sm font-semibold text-foreground"
      >
        {PLATFORM_SELECT_COPY.newTitle}
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{PLATFORM_SELECT_COPY.name}</Label>
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
          {PLATFORM_SELECT_COPY.url}{" "}
          <span className="font-normal text-muted-foreground">
            {PLATFORM_SELECT_COPY.optional}
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
          aria-describedby={errors.url ? `${urlId}-error ${hintId}` : hintId}
        />
        {errors.url ? (
          <p id={`${urlId}-error`} className="text-xs text-destructive">
            {errors.url}
          </p>
        ) : null}
      </div>

      <p
        id={hintId}
        className="flex items-start gap-1.5 text-xs text-muted-foreground"
      >
        <LockKeyholeIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        {PLATFORM_SELECT_COPY.privacyHint}
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
          {PLATFORM_SELECT_COPY.back}
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
          {PLATFORM_SELECT_COPY.submit}
        </Button>
      </div>
    </form>
  );
}
