"use client";

import {
  CatalogSelect,
  findCatalogOptionByName,
  filterCatalogOptions,
  validateCatalogInput,
  type CatalogCopy,
  type CatalogCreateOutcome,
  type CatalogOption,
} from "@/components/applications/catalog-select";

/** The fields of a `GET /platforms` row the picker reads. */
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
 * - `exists`: the 409; `message` is its `detail`, shown verbatim, and
 *   `platform` (looked up by name after refetching) is selected when given.
 * - `failed`: anything else; the create form stays open and shows `message`.
 */
export type PlatformCreateOutcome =
  | { status: "created"; platform: PlatformOption }
  | { status: "exists"; message: string; platform?: PlatformOption | null }
  | { status: "failed"; message: string };

export const PLATFORM_SELECT_COPY: CatalogCopy = {
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
};

const NAME_MAX = 100;
const URL_MAX = 200;

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
  return findCatalogOptionByName(options, name);
}

/** Exact match first, then prefix, then substring; list order within each. */
export function filterPlatforms(
  options: readonly PlatformOption[],
  search: string,
): PlatformOption[] {
  return filterCatalogOptions(options, search);
}

export function validatePlatformInput(
  name: string,
  url: string,
): { name?: string; url?: string } {
  return validateCatalogInput(name, url, PLATFORM_SELECT_COPY, {
    nameMax: NAME_MAX,
    urlMax: URL_MAX,
  });
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
  "aria-required"?: boolean;
  className?: string;
}

/**
 * Thin wrapper on `CatalogSelect` (KODI-035): keeps the exact external shape
 * this component always had (options/onCreate driven by the caller), so
 * every existing caller and test is untouched. An exact, case-insensitive
 * match replaces "Create" (AC17, `exactMatchReplacesCreate`).
 */
export function PlatformSelect({
  options,
  isLoading,
  value,
  onValueChange,
  onCreate,
  disabled,
  id,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  className,
}: PlatformSelectProps) {
  const catalogOptions: readonly CatalogOption[] | undefined = options;

  return (
    <CatalogSelect
      kind="platform"
      copy={PLATFORM_SELECT_COPY}
      nameMax={NAME_MAX}
      urlMax={URL_MAX}
      options={catalogOptions}
      isLoading={isLoading}
      value={value}
      onValueChange={(id) => onValueChange(id)}
      onCreate={async (input): Promise<CatalogCreateOutcome> => {
        const outcome = await onCreate(input);
        if (outcome.status === "created") {
          return { status: "created", option: outcome.platform };
        }
        if (outcome.status === "failed") {
          return { status: "failed", message: outcome.message };
        }
        return {
          status: "exists",
          message: outcome.message,
          option: outcome.platform ?? null,
        };
      }}
      exactMatchReplacesCreate
      disabled={disabled}
      id={id}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      className={className}
    />
  );
}
