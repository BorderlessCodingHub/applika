"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useModal } from "@/features/applications/context/ModalProvider";
import type { Platform } from "@/features/applications/schemas/supportSchema";

interface SearchApplicationsProps {
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  filterStatus: string;
}

export default function SearchApplications({
  onSearchChange,
  onFilterChange,
  filterStatus,
}: SearchApplicationsProps) {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const modal = useModal();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchChange(value);
  };

  const handleFilterChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange(value);
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
      "
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-4 flex-1 w-full sm:max-w-2xl">
          <div className="flex items-center gap-2 flex-1">
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

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/60">Status:</span>
            <select
              value={filterStatus}
              onChange={handleFilterChange}
              className="
                bg-white/10 border border-white/20 text-white text-sm rounded-lg 
                focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2.5
                [&>option]:text-black
              "
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
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
