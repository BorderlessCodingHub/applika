"use client";

import { useEffect, useState, ChangeEvent } from "react";
import AddApplicationModal from "../modals/AddApplicationModal";
import { fetchSupportsPlatforms } from "@/features/applications/services/applicationsService";
import type { Platform } from "@/features/applications/schemas/supportSchema";

interface SearchApplicationsProps {
  onSearchChange: (value: string) => void;
}

export default function SearchApplications({
  onSearchChange,
}: SearchApplicationsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadPlatforms() {
      try {
        const data = await fetchSupportsPlatforms();
        setPlatforms(data);
      } catch (err: any) {
        setError(err.message || "Failed to load platforms");
      } finally {
        setLoading(false);
      }
    }
    loadPlatforms();
  }, []);

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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchChange(value);
  };

  return (
    <>
      <div
        className="
          backdrop-blur-xl bg-white/5 border border-white/20 
          rounded-2xl p-6 my-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        "
      >
        <div
          className="
            flex flex-col sm:flex-row sm:justify-between sm:items-center 
            gap-4 sm:gap-6
          "
        >
          <div className="flex items-center gap-2 flex-1 w-full sm:max-w-md">
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

          <div className="flex sm:justify-end w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={loading}
              className="
                flex justify-center items-center gap-2 font-semibold text-sm
                bg-emerald-400/80 border border-emerald-600 text-black
                w-full sm:w-auto px-6 py-3 rounded-lg
                cursor-pointer backdrop-blur-sm transition-all duration-300
                hover:bg-emerald-400 hover:-translate-y-0.5
                hover:shadow-[0_4px_12px_rgba(39,174,96,0.3)]
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <i className="fa-solid fa-plus" />
              {loading ? "Loading..." : "Add Application"}
            </button>
          </div>
        </div>
      </div>

      <AddApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        platforms={platforms.map((p) => ({
          id: p.id.toString(),
          name: p.name,
        }))}
        onSubmit={() => setModalOpen(false)}
      />
    </>
  );
}
