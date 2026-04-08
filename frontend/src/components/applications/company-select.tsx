import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Company } from "@/services/types/applications";
import { cn } from "@/lib/utils";
import z from "zod";
import { UseFormReturn } from "react-hook-form";
import { CompanyOptionsList } from "./company-select-options";
import { Label } from "../ui/label";

// ---------------------------------------------------------------------------
// Form typing
// ---------------------------------------------------------------------------
// The `company` field in the parent form is polymorphic:
//   - string   → ID of an existing company selected from the dropdown
//   - object   → new company created inline ({ name, url })
//   - undefined → nothing selected yet
// ---------------------------------------------------------------------------

interface CompanyFormReturn {
  company?:
    | string
    | {
        name?: string | undefined;
        url?: string | undefined;
      }
    | undefined;
}
type CompanyForm<T extends CompanyFormReturn> = UseFormReturn<T>;

interface CompanySelectProps<TForm extends CompanyFormReturn> {
  /** The react-hook-form instance that owns the `company` field. */
  form: CompanyForm<TForm>;
  /** External company value used to seed the select when editing an application. */
  value?: Company | null;
  /** Async search function that returns matching companies from the API. */
  fetchCompanies: (query: string) => Promise<Company[]>;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// CompanySelectBase
// ---------------------------------------------------------------------------
// A searchable combobox that lets the user either pick an existing company
// or type a new name to create one inline.
//
// State flow:
//   1. `selectedCompany` (local) tracks what the user picked / typed.
//   2. Every selection/creation also writes into the parent form via
//      `setCompanyValue` so the form's `company` field stays in sync.
//   3. The `value` prop seeds the initial state (edit mode) and is re-synced
//      via useEffect when the parent passes a different application.
// ---------------------------------------------------------------------------

function CompanySelectBase<TForm extends CompanyFormReturn>({
  form,
  value,
  placeholder = "Search companies…",
  fetchCompanies,
}: CompanySelectProps<TForm>) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(
    value ?? null,
  );
  // Incrementing key forces CompanyOptionsList to remount (resets its internal
  // search cache) every time the popover opens.
  const [listKey, setListKey] = React.useState(0);

  // Narrowed setValue — avoids generic form typing issues when writing to the
  // polymorphic `company` field (string | object).
  const setCompanyValue = form.setValue as (
    name: "company",
    value: string | { name: string; url?: string },
    options?: { shouldValidate: boolean },
  ) => void;

  // Refs mirror the latest state so that useCallback handlers (which have a
  // stable identity for the memoized CompanyOptionsList) can read fresh values
  // without re-creating themselves on every render.
  const selectedCompanyRef = React.useRef(selectedCompany);
  const inputValueRef = React.useRef(inputValue);

  React.useLayoutEffect(() => {
    selectedCompanyRef.current = selectedCompany;
    inputValueRef.current = inputValue;
  });

  // Sync internal state AND form value when the external `value` prop changes
  // (e.g. parent loads a different application for editing). Without this the
  // UI would show the correct company name but the form field would remain
  // stale/undefined, causing validation to fail on submit.
  React.useEffect(() => {
    const company = value ?? null;
    setSelectedCompany(company);
    if (company) {
      // Existing company → write its ID; new/free-text company → write object
      setCompanyValue(
        "company",
        company.id ? company.id : { name: company.name, url: company.url ?? "" },
        { shouldValidate: false },
      );
    }
  }, [value?.id, value?.name, setCompanyValue]);

  // Keep the visible text in the trigger button up-to-date whenever the
  // popover closes or the selected company changes from outside.
  React.useEffect(() => {
    if (open) return;
    setInputValue(selectedCompany?.name ?? "");
  }, [open, selectedCompany?.id, selectedCompany?.name]);

  /** Select an existing company (writes the company ID to the form). */
  function onCompanySelect(company: Company | null) {
    setSelectedCompany(company);
    setCompanyValue("company", company ? company.id : "", {
      shouldValidate: company != null,
    });
  }

  /** Create a new company inline (writes a { name, url } object to the form).
   *  Triggered when the user closes the popover with typed text that doesn't
   *  match any existing company. */
  function onCompanyCreate(prefill: string) {
    setSelectedCompany({ id: "", name: prefill, url: "" });
    setCompanyValue(
      "company",
      { name: prefill, url: "" },
      { shouldValidate: false },
    );
  }

  /** Extracts the appropriate error message depending on whether the current
   *  company value is a string (existing) or an object (new). The Zod schema
   *  places errors at different paths for each variant. */
  function getCompanyErrorMsg() {
    const isObj = selectedCompany !== null && !selectedCompany.id;
    if (!isObj) {
      return (form.formState.errors as { company?: { message?: string } })
        .company?.message;
    }
    if (!form.formState.errors.company) return undefined;
    return (form.formState.errors.company as { name?: { message?: string } })
      .name?.message;
  }

  // -------------------------------------------------------------------------
  // Stable callbacks passed to the memoized CompanyOptionsList.
  // They use refs instead of state to avoid re-creating on every render,
  // which would remount the options list and lose its internal state.
  // -------------------------------------------------------------------------

  /** Called on every keystroke inside the popover search input. If the user
   *  edits the text away from the currently selected company name, the
   *  selection is cleared so the form doesn't submit a stale company ID. */
  const handleInputChange = React.useCallback(
    (search: string) => {
      setInputValue(search);
      if (
        selectedCompanyRef.current &&
        search !== selectedCompanyRef.current.name
      ) {
        setSelectedCompany(null);
        setCompanyValue("company", "", { shouldValidate: false });
      }
    },
    [setCompanyValue],
  );

  /** Called when the user picks a company from the dropdown list. */
  const handleSelect = React.useCallback(
    (company: Company) => {
      setSelectedCompany(company);
      setCompanyValue("company", company.id, { shouldValidate: true });
      setInputValue(company.name);
      setOpen(false);
    },
    [setCompanyValue],
  );

  /** Called when the user clicks "Create new" in the dropdown. Uses the
   *  current search text as the new company name. */
  const handleCreateNew = React.useCallback(() => {
    const prefill = inputValueRef.current.trim();
    setSelectedCompany({ id: "", name: prefill, url: "" });
    setCompanyValue(
      "company",
      { name: prefill, url: "" },
      { shouldValidate: false },
    );
    setOpen(false);
  }, [setCompanyValue]);

  // Plain function — intentionally captures fresh selectedCompany and inputValue
  // from closure (Radix fires onOpenChange in the same event batch as handleSelect,
  // so refs would lag behind render here).
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setListKey((k) => k + 1); // remounts CompanyOptionsList → resets cache
    } else if (!selectedCompany && inputValue.trim()) {
      onCompanyCreate(inputValue.trim());
    }
    setOpen(next);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCompanySelect(null);
    setInputValue("");
  };

  const companyNameError = getCompanyErrorMsg();
  const displayValue = inputValue || selectedCompany?.name || "";

  // Only highlight the selected row in the dropdown when the input text
  // exactly matches the company name — prevents stale highlights while typing.
  const effectiveSelectedId =
    selectedCompany?.id && inputValue === selectedCompany.name
      ? selectedCompany.id
      : undefined;

  return (
    <div data-slot="company-select" className="space-y-1.5">
      <Label>Company *</Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <div className="relative">
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "w-full justify-between font-normal bg-card",
                companyNameError && "border-destructive",
              )}
            >
              <span
                data-slot="company-select-value"
                className={cn(
                  "truncate",
                  !displayValue && "text-muted-foreground",
                )}
              >
                {displayValue || placeholder}
              </span>
              <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          {displayValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-9 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear selection"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <CompanyOptionsList
            key={listKey}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            selectedCompanyId={effectiveSelectedId}
            fetchCompanies={fetchCompanies}
            onSelect={handleSelect}
            onCreateNew={handleCreateNew}
            placeholder={placeholder}
          />
        </PopoverContent>
      </Popover>

      {companyNameError && (
        <p className="text-xs text-destructive">{companyNameError}</p>
      )}
    </div>
  );
}

export const CompanySelect = CompanySelectBase;

// ---------------------------------------------------------------------------
// Validation & parsing helpers
// ---------------------------------------------------------------------------
// Exported as `ZodType` and consumed by the parent form schema.
//
// The company field is a **discriminated union** at the form level:
//   - string   → existing company selected by ID
//   - object   → new company typed by the user ({ name, url })
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
