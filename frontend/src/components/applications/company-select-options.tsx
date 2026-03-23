import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Company } from "@/services/types/applications";
import { cn } from "@/lib/utils";








// ---------------------------------------------------------------------------
// CompanyOptionsList — owns fetch, cache, debounce, and the Command list UI
// ---------------------------------------------------------------------------

interface CompanyOptionsListProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedCompanyId?: string;
  fetchCompanies: (query: string) => Promise<Company[]>;
  onSelect: (company: Company) => void;
  onCreateNew: () => void;
  placeholder?: string;
}

const CompanyOptionsListBase = React.memo(function CompanyOptionsList({
  inputValue,
  onInputChange,
  selectedCompanyId,
  fetchCompanies,
  onSelect,
  onCreateNew,
  placeholder,
}: CompanyOptionsListProps) {
  const [options, setOptions] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(false);

  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestId = React.useRef(0);
  const cache = React.useRef<Map<string, Company[]>>(new Map());
  const exhausted = React.useRef<Set<string>>(new Set());
  const fetchRef = React.useRef(fetchCompanies);

  // Keep fetchRef current without destabilising performSearch
  React.useLayoutEffect(() => {
    fetchRef.current = fetchCompanies;
  });

  // Cancel pending debounce on unmount
  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  // Clear results when input is emptied programmatically (e.g. X button in parent)
  React.useEffect(() => {
    if (!inputValue.trim()) {
      clearTimeout(timerRef.current);
      setOptions([]);
      setLoading(false);
    }
  }, [inputValue]);

  const performSearch = React.useCallback(async (query: string) => {
    const trimmed = query.trim().toLowerCase();

    // If a more general exhausted query is a prefix → filter from its cache
    for (const q of exhausted.current) {
      if (trimmed.startsWith(q)) {
        const cached = cache.current.get(q);
        if (cached) {
          setOptions(
            cached
              .filter((c) => c.name.toLowerCase().includes(trimmed))
              .slice(0, 10),
          );
        }
        return;
      }
    }

    if (cache.current.has(trimmed)) {
      setOptions(cache.current.get(trimmed)!.slice(0, 10));
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    try {
      const results = await fetchRef.current(query);
      if (id !== requestId.current) return;
      const sliced = results.slice(0, 10);
      cache.current.set(trimmed, sliced);
      if (results.length < 10) exhausted.current.add(trimmed);
      setOptions(sliced);
    } catch {
      if (id === requestId.current) setOptions([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  function handleValueChange(search: string) {
    onInputChange(search);
    if (!search.trim()) return; // useEffect handles clearing
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void performSearch(search), 300);
  }

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={placeholder}
        value={inputValue}
        onValueChange={handleValueChange}
        inputMode="search"
        onKeyDown={(e) => {
          if (e.key === "Home" || e.key === "End") e.stopPropagation();
        }}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && inputValue.trim() && options.length === 0 && (
          <CommandEmpty>No companies found.</CommandEmpty>
        )}

        {options.length > 0 && (
          <CommandGroup>
            {options.map((company) => (
              <CommandItem
                key={company.id}
                value={company.id}
                onSelect={() => onSelect(company)}
                data-selected={
                  selectedCompanyId === company.id ? "" : undefined
                }
                className="flex items-center gap-2"
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    selectedCompanyId === company.id
                      ? "opacity-100"
                      : "opacity-0",
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">{company.name}</span>
                  {company.url && (
                    <span className="truncate text-xs text-muted-foreground">
                      {company.url}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup forceMount>
          <CommandItem
            forceMount
            onSelect={onCreateNew}
            className="flex items-center gap-2"
          >
            <Plus className="size-4 shrink-0" />
            <span className="text-sm">Create new company</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
});

export const CompanyOptionsList = CompanyOptionsListBase;