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

interface CompanyFormReturn {
  company?:
    | string
    | {
        name?: string | undefined;
        url?: string | undefined;
      }
    | undefined;
}
interface CompanyForm<T extends CompanyFormReturn> extends UseFormReturn<T> {}

interface CompanySelectProps<TForm extends CompanyFormReturn> {
  form: CompanyForm<TForm>;
  value?: Company | null;
  fetchCompanies: (query: string) => Promise<Company[]>;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// CompanySelectBase — trigger UI, form integration, error display
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
  const [listKey, setListKey] = React.useState(0);

  // Refs used by stable callbacks to read latest state without stale closures
  const selectedCompanyRef = React.useRef(selectedCompany);
  const inputValueRef = React.useRef(inputValue);

  React.useLayoutEffect(() => {
    selectedCompanyRef.current = selectedCompany;
    inputValueRef.current = inputValue;
  });

  // Sync internal state when the value prop changes (e.g. different application loaded)
  React.useEffect(() => {
    setSelectedCompany(value ?? null);
  }, [value?.id]);

  // Sync display input when popover closes or selected company changes
  React.useEffect(() => {
    if (open) return;
    setInputValue(selectedCompany?.name ?? "");
  }, [open, selectedCompany?.id, selectedCompany?.name]);

  function onCompanySelect(company: Company | null) {
    setSelectedCompany(company);
    (form.setValue as (n: string, v: unknown, o?: unknown) => void)(
      "company",
      company ? company.id : "",
      { shouldValidate: company != null },
    );
  }

  function onCompanyCreate(prefill: string) {
    setSelectedCompany({ id: "", name: prefill, url: "" });
    (form.setValue as (n: string, v: unknown, o?: unknown) => void)(
      "company",
      { name: prefill, url: "" },
      { shouldValidate: false },
    );
  }

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

  // Stable callbacks passed to the memoized CompanyOptionsList
  const handleInputChange = React.useCallback((search: string) => {
    setInputValue(search);
    if (
      selectedCompanyRef.current &&
      search !== selectedCompanyRef.current.name
    ) {
      setSelectedCompany(null);
      (form.setValue as (n: string, v: unknown, o?: unknown) => void)(
        "company",
        "",
        { shouldValidate: false },
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = React.useCallback((company: Company) => {
    setSelectedCompany(company);
    (form.setValue as (n: string, v: unknown, o?: unknown) => void)(
      "company",
      company.id,
      { shouldValidate: true },
    );
    setInputValue(company.name);
    setOpen(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateNew = React.useCallback(() => {
    const prefill = inputValueRef.current.trim();
    setSelectedCompany({ id: "", name: prefill, url: "" });
    (form.setValue as (n: string, v: unknown, o?: unknown) => void)(
      "company",
      { name: prefill, url: "" },
      { shouldValidate: false },
    );
    setOpen(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const effectiveSelectedId =
    selectedCompany?.id && inputValue === selectedCompany.name
      ? selectedCompany.id
      : undefined;

  return (
    <div data-slot="company-select" className="space-y-2">
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
        code: z.ZodIssueCode.custom,
        message: "Company is required",
      });
      return;
    }

    // String case
    if (typeof value === "string") {
      if (value.trim().length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
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
          code: z.ZodIssueCode.custom,
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
          code: z.ZodIssueCode.custom,
          message: "Invalid url",
        });
      }
    }
  });

type ParseArgType =
  | string
  | { name?: string | undefined; url?: string | undefined }
  | undefined;
function parseSchema(value: ParseArgType) {
  // String stays string (trimmed)
  if (typeof value === "string") {
    return value.trim();
  }

  // Object normalization
  return {
    name: (value?.name ?? "").trim(),
    url: value?.url && value.url !== "" ? value.url : null,
  };
}

export const ZodType = {
  ZodSchema,
  parseSchema,
};
