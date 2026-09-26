"use client";

import * as React from "react";
import { z } from "zod";

import {
  CatalogSelect,
  type CatalogCopy,
  type CatalogCreateOutcome,
  type CatalogOption,
} from "@/components/applications/catalog-select";
import { useCreateCompany } from "@/hooks/use-create-company";
import type { Company } from "@/services/types/applications";

const NAME_MAX = 200;
const URL_MAX = 2083;

export const COMPANY_SELECT_COPY: CatalogCopy = {
  placeholder: "Select a company",
  listLabel: "Choose a company",
  search: "Search or add a company",
  loading: "Loading companies",
  noMatch: "No company matches.",
  createNew: "Add a new company",
  newTitle: "New company",
  name: "Name",
  url: "URL",
  optional: "(optional)",
  urlHint: "Leave it blank to keep the name on this application only.",
  privacyHint: "Only you see it until an admin approves it.",
  back: "Back",
  submit: "Add company",
  nameRequired: "Name is required",
  nameTooLong: "Name must be 200 characters or fewer",
  urlInvalid: "Enter a full URL, like https://example.com",
  urlTooLong: "URL must be 2083 characters or fewer",
  createFailed: "Could not add the company. Try again.",
  nowSelected: "It is now selected.",
};

function freeTextMessage(name: string): string {
  return `${name} is kept on this application only.`;
}

// ---------------------------------------------------------------------------
// Form typing
// ---------------------------------------------------------------------------
// The `company` field in the parent form is polymorphic:
//   - string   → ID of an existing company selected from the dropdown
//   - object   → new company created inline ({ name, url }), free text only —
//                a URL-having company is resolved to an id by the picker
//                itself (KODI-035, T111)
//   - undefined → nothing selected yet
// ---------------------------------------------------------------------------

export interface CompanySelectProps {
  /** The react-hook-form instance that owns the `company` field. */
  form: {
    setValue: (
      name: "company",
      value: string | { name: string; url?: string },
      options?: { shouldValidate: boolean },
    ) => void;
    formState: { errors: Record<string, unknown> };
  };
  /** External company value used to seed the select when editing an application. */
  value?: Company | null;
  /** Async search function that returns matching companies from the API. */
  fetchCompanies: (query: string) => Promise<Company[]>;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  /**
   * Fired with the full `Company` whenever the selection changes: an existing
   * pick, an id resolved for a brand-new company, a free-text name, or `null`
   * on clear. The form field only ever carries an id or a bare `{name, url}`
   * — this is how a caller (the new-with-cv draft flow) recovers the NAME of
   * an existing selection, which the form value alone does not carry.
   */
  onCompanyChange?: (company: Company | null) => void;
}

/**
 * The company field, on `CatalogSelect` (KODI-035, T108): the same picker and
 * behaviour as the platform field (AC1). A URL confirmed in the create form
 * calls `POST /companies` and selects the returned id — 201 new or 200 reused
 * (AC2, R-021); a blank URL keeps the name as free text on this application
 * only (R-019). `exactMatchReplacesCreate={false}`: a matching name is listed
 * first but "Create" stays offered, and the create form never shortcuts on a
 * name-only match — the server alone decides reuse.
 */
export function CompanySelect({
  form,
  value,
  placeholder,
  id,
  "aria-invalid": ariaInvalid,
  fetchCompanies,
  onCompanyChange,
}: CompanySelectProps) {
  const [options, setOptions] = React.useState<Company[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const requestId = React.useRef(0);
  const createCompany = useCreateCompany();

  const initialSelected: CatalogOption | null = value
    ? { id: value.id ?? "", name: value.name, url: value.url ?? null }
    : null;
  const [selectedOption, setSelectedOption] =
    React.useState<CatalogOption | null>(initialSelected);
  const [currentId, setCurrentId] = React.useState(value?.id ?? "");

  // Re-seed when the external `value` prop changes (e.g. editing a different
  // application) — mirrors the previous behaviour.
  React.useEffect(() => {
    setSelectedOption(
      value
        ? { id: value.id ?? "", name: value.name, url: value.url ?? null }
        : null,
    );
    setCurrentId(value?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.id, value?.name, value?.url]);

  const setCompanyValue = form.setValue;

  const handleSearchChange = React.useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setOptions([]);
        setIsLoading(false);
        return;
      }
      const id = ++requestId.current;
      setIsLoading(true);
      try {
        const results = await fetchCompanies(trimmed);
        if (id !== requestId.current) return;
        setOptions(results);
      } catch {
        if (id === requestId.current) setOptions([]);
      } finally {
        if (id === requestId.current) setIsLoading(false);
      }
    },
    [fetchCompanies],
  );

  const applyOption = (option: CatalogOption) => {
    setSelectedOption(option);
    setCurrentId(option.id);
    if (option.id) {
      setCompanyValue("company", option.id, { shouldValidate: true });
      onCompanyChange?.({
        id: option.id,
        name: option.name,
        url: option.url ?? "",
      });
    } else {
      setCompanyValue(
        "company",
        { name: option.name, url: "" },
        { shouldValidate: false },
      );
      onCompanyChange?.({ id: "", name: option.name, url: "" });
    }
  };

  const catalogOptions: readonly CatalogOption[] = options.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url ?? null,
    is_public: c.is_public,
  }));

  return (
    <CatalogSelect
      kind="company"
      copy={COMPANY_SELECT_COPY}
      nameMax={NAME_MAX}
      urlMax={URL_MAX}
      options={catalogOptions}
      isLoading={isLoading}
      value={currentId}
      selectedOption={selectedOption}
      onValueChange={(_id, option) => applyOption(option)}
      onSearchChange={handleSearchChange}
      onCreate={async (input): Promise<CatalogCreateOutcome> => {
        if (!input.url) {
          const option: CatalogOption = { id: "", name: input.name, url: null };
          return {
            status: "freeText",
            option,
            message: freeTextMessage(input.name),
          };
        }
        const company = await createCompany.mutateAsync({
          name: input.name,
          url: input.url,
        });
        const option: CatalogOption = {
          id: company.id,
          name: company.name,
          url: company.url ?? null,
          is_public: company.is_public,
        };
        // The service does not surface 200-vs-201; treat every success as a
        // plain pick, matching the "created" no-notice path. See the
        // KODI-035 handback notes for why the reuse notice is not shown.
        return { status: "created", option };
      }}
      exactMatchReplacesCreate={false}
      disabled={false}
      id={id}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
    />
  );
}

// ---------------------------------------------------------------------------
// Validation & parsing helpers
// ---------------------------------------------------------------------------
// Exported as `ZodType` and consumed by the parent form schema.
//
// The company field is a **discriminated union** at the form level:
//   - string   → existing company selected by ID
//   - object   → free-text company typed by the user ({ name, url })
//
// `ZodSchema`    validates either variant before form submission.
// `parseSchema`  normalises the validated value into the API payload shape.
// ---------------------------------------------------------------------------

const ZodSchema = z
  .union([
    z.string().optional(),
    z
      .object({
        name: z.string().optional(),
        url: z
          .union([z.literal(""), z.httpUrl({ error: "Invalid url." })])
          .optional(),
      })
      .optional(),
  ])
  .superRefine((value, ctx) => {
    // Must exist
    if (value === undefined || value === null) {
      ctx.addIssue({
        code: "custom",
        message: "Company is required",
      });
      return;
    }

    // String case
    if (typeof value === "string") {
      if (value.trim().length < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Company name must have at least 1 character",
        });
      }
      return;
    }

    // Object case
    if (typeof value === "object") {
      if (!value.name || value.name.trim().length < 1) {
        ctx.addIssue({
          path: ["name"],
          code: "custom",
          message: "Company name is required",
        });
      }

      if (
        value.url &&
        value.url !== "" &&
        !z.httpUrl().safeParse(value.url).success
      ) {
        ctx.addIssue({
          path: ["url"],
          code: "custom",
          message: "Invalid url",
        });
      }
    }
  });

type ParseArgType =
  | string
  | { name?: string | undefined; url?: string | undefined }
  | undefined;

/** Converts the validated form value into the shape expected by the API:
 *  - string (company ID) is trimmed and passed through
 *  - object is normalised: name trimmed, empty url coerced to null */
function parseSchema(value: ParseArgType) {
  if (typeof value === "string") {
    return value.trim();
  }

  return {
    name: (value?.name ?? "").trim(),
    url: value?.url && value.url !== "" ? value.url : null,
  };
}

export const ZodType = {
  ZodSchema,
  parseSchema,
};
