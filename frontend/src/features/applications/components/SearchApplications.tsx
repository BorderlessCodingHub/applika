"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useModal } from "@/features/applications/context/ModalProvider";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import FilterStatusPill from "@/components/ui/FilterStatusPill";
import FilterStatusSegmented from "@/components/ui/FilterStatusSegmented";
import {
  FILTER_STATUS_OPTIONS,
  FilterStatus,
} from "@/domain/constants/application";

interface SearchApplicationsProps {
  onSearchChange: (value: string) => void;
  onFilterChange: (value: FilterStatus) => void;
  filterStatus: FilterStatus;
  filterVariant?: "pill" | "segmented" | "select";
}

export default function SearchApplications({
  onSearchChange,
  onFilterChange,
  filterStatus,
  filterVariant = "pill",
}: SearchApplicationsProps) {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const modal = useModal();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchChange(value);
  };

  useEffect(() => {
    function handleApplicationsUpdated() {
      setSearchTerm("");
      onSearchChange("");
    }

    window.addEventListener("applications:updated", handleApplicationsUpdated);
    return () =>
      window.removeEventListener(
        "applications:updated",
        handleApplicationsUpdated
      );
  }, [onSearchChange]);

  return (
    <div
      className="
        backdrop-blur-xl bg-white/5 border border-white/20 
        rounded-2xl p-6 my-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        relative z-30
      "
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full sm:max-w-2xl">
          <div className="w-full">
            <input
              type="text"
              placeholder="Search applications..."
              onChange={handleInputChange}
              value={searchTerm}
              className="
                flex-1 px-4 py-3 text-white text-sm w-full
                bg-white/10 border border-white/20 rounded-lg
                backdrop-blur-sm transition-all duration-300
                placeholder-white/60
                focus:outline-none focus:border-white/40
                focus:bg-white/15 focus:shadow-[0_4px_12px_rgba(0,0,0,0.1)]
              "
            />
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            {filterVariant === "select" && (
              <ListBoxSelect
                value={filterStatus}
                onChange={(option) => onFilterChange(option.id)}
                options={[...FILTER_STATUS_OPTIONS]}
                placeholder="Status"
                className="w-28 sm:w-36"
              />
            )}
            {filterVariant === "pill" && (
              <FilterStatusPill value={filterStatus} onChange={onFilterChange} />
            )}
            {filterVariant === "segmented" && (
              <FilterStatusSegmented value={filterStatus} onChange={onFilterChange} />
            )}
          </div>
        </div>

        <div className="flex sm:justify-end w-full sm:w-auto">
          <button
            type="button"
            onClick={() => modal.open("addApp")}
            className="
              flex justify-center items-center gap-2 font-semibold text-sm
              bg-emerald-400/80 border border-emerald-600 text-black
              w-full sm:w-auto px-6 py-3 rounded-lg
              cursor-pointer backdrop-blur-sm transition-all duration-300
              hover:bg-emerald-400 hover:-translate-y-0.5
              hover:shadow-[0_4px_12px_rgba(39,174,96,0.3)]
            "
          >
            <i className="fa-solid fa-plus" />
            Add Application
          </button>
        </div>
      </div>
    </div>
  );
}
