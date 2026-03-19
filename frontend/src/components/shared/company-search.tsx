"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCompanySearch, useCreateCompany } from "@/hooks/use-companies";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Plus, Globe, Check } from "lucide-react";

const createCompanySchema = z.object({
  url: z.url({
    protocol: /^https?$/,
    hostname: z.regexes.domain,
    error: "Invalid url."
  }),
});

type CreateCompanyForm = z.infer<typeof createCompanySchema>;

interface SelectedCompany {
  id: string;
  name: string;
}

interface CompanySearchProps {
  initialCompany?: { id: string; name: string } | null;
  onCompanyChange: (company: SelectedCompany | null) => void;
  resetKey?: number;
}

export function CompanySearch({
  initialCompany,
  onCompanyChange,
  resetKey,
}: CompanySearchProps) {
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    initialCompany?.id ?? null,
  );
  const [companyName, setCompanyName] = useState(initialCompany?.name ?? "");
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [prevInitialCompany, setPrevInitialCompany] = useState(initialCompany);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  const hasValidCompany = !!selectedCompanyId;

  const { data: companyResults = [] } = useCompanySearch(debouncedSearch);
  const createCompanyMutation = useCreateCompany();

  const form = useForm<CreateCompanyForm>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { url: "" },
  });

  if (prevInitialCompany !== initialCompany || prevResetKey !== resetKey) {
    setPrevInitialCompany(initialCompany);
    setPrevResetKey(resetKey);
    setCompanyName(initialCompany?.name ?? "");
    setSelectedCompanyId(initialCompany?.id ?? null);
    setShowCreateCompany(false);
  }

  useEffect(() => {
    form.reset({ url: "" });
  }, [initialCompany, resetKey, form]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(companyName);
    }, 300);
    return () => clearTimeout(timer);
  }, [companyName]);

  const showCompanyDropdown =
    debouncedSearch.length >= 2 && !selectedCompanyId && !showCreateCompany;

  const selectCompany = (company: SelectedCompany) => {
    setSelectedCompanyId(company.id);
    setCompanyName(company.name);
    setShowCreateCompany(false);
    form.reset({ url: "" });
    onCompanyChange(company);
  };

  const handleCreateCompany = (data: CreateCompanyForm) => {
    if (!companyName.trim()) return;

    createCompanyMutation.mutate(
      { name: companyName.trim(), url: data.url || undefined },
      {
        onSuccess: (company) => {
          selectCompany(company);
          toast.success(`Company "${company.name}" created`);
        },
        onError: () => {
          toast.error("Failed to create company");
        },
      },
    );
  };

  const handleShowCreateForm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowCreateCompany(true);
  };

  return (
    <div className="relative space-y-1.5">
      <Label>Company *</Label>
      <Input
        value={companyName}
        onChange={(e) => {
          setCompanyName(e.target.value);
          setSelectedCompanyId(null);
          setShowCreateCompany(false);
          form.reset({ url: "" });
          onCompanyChange(null);
        }}
        placeholder="Search or type company name…"
      />
      {showCompanyDropdown && (
        <div className="shadow-elevated absolute top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-popover">
          {companyResults.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => selectCompany(c)}
            >
              {c.name}
            </button>
          ))}
          {companyResults.length === 0 &&
            debouncedSearch.trim().length >= 2 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary transition-colors hover:bg-accent"
                onClick={handleShowCreateForm}
              >
                <Plus className="h-3.5 w-3.5" />
                Create &ldquo;{companyName}&rdquo;
              </button>
            )}
        </div>
      )}

      {showCreateCompany && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-sm font-medium text-foreground">
            Register &ldquo;{companyName}&rdquo;
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Company LinkedIn URL
            </Label>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                {...form.register("url")}
                placeholder="https://www.linkedin.com/company/..."
                className={cn(
                  "pl-8",
                  form.formState.errors.url &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              />
            </div>
            {form.formState.errors.url && (
              <p className="text-xs text-destructive">
                {form.formState.errors.url.message}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit(handleCreateCompany)();
              }}
              disabled={createCompanyMutation.isPending}
            >
              {createCompanyMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Register Company
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCreateCompany(false);
                form.reset({ url: "" });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {hasValidCompany && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check /> {companyName}
        </p>
      )}
    </div>
  );
}
