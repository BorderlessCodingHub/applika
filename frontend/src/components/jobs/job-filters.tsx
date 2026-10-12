"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RangeSlider } from "@/components/ui/range-slider";
import type { JobsFilters } from "@/hooks/use-jobs";

interface JobFiltersProps {
  filters: JobsFilters;
  onFilterChange: <K extends keyof JobsFilters>(
    key: K,
    value: JobsFilters[K],
  ) => void;
  onClear: () => void;
  hasResume: boolean;
}

export function JobFilters({
  filters,
  onFilterChange,
  onClear,
  hasResume,
}: JobFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange("search", searchInput || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onFilterChange]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInput(e.target.value);
    },
    [],
  );

  const hasActive =
    !!filters.search ||
    !!filters.source ||
    !!filters.minFit ||
    (filters.sort && filters.sort !== "newest");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Search jobs..."
        value={searchInput}
        onChange={handleSearch}
        className="w-56"
      />

      <Select
        value={filters.source ?? "all"}
        onValueChange={(v) =>
          onFilterChange("source", v === "all" ? undefined : v)
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sources</SelectItem>
          <SelectItem value="himalayas">Himalayas</SelectItem>
          <SelectItem value="remoteok">RemoteOK</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.sort ?? "newest"}
        onValueChange={(v) =>
          onFilterChange("sort", v as JobsFilters["sort"])
        }
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
          <SelectItem value="best_fit">Best Fit</SelectItem>
        </SelectContent>
      </Select>

      {hasResume && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Min fit: {filters.minFit ?? 0}%
          </span>
          <RangeSlider
            className="w-28"
            min={0}
            max={100}
            step={5}
            value={[filters.minFit ?? 0]}
            onValueChange={([v]) =>
              onFilterChange("minFit", v > 0 ? v : undefined)
            }
          />
        </div>
      )}

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
