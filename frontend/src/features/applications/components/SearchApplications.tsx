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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log("[SearchApplications] onSearchChange ->", value);
    onSearchChange(value);
  };

  return (
    <>
      <div
        className="
          backdrop-blur-xl bg-white/5 border border-white/20 
          rounded-2xl p-8 my-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        "
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search applications..."
              onChange={handleInputChange}
              className="
                flex-1 px-4 py-3 text-white text-sm
                bg-white/10 border border-white/20 rounded-lg
                backdrop-blur-sm transition-all duration-300
                placeholder-white/60
                focus:outline-none focus:border-white/40
                focus:bg-white/15 focus:shadow-[0_4px_12px_rgba(0,0,0,0.1)]
              "
            />
          </div>

          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={loading}
              className="
                flex items-center gap-2 font-semibold
                bg-emerald-400/80 border border-emerald-600 text-black
                px-6 py-3 rounded-lg cursor-pointer
                backdrop-blur-sm transition-all duration-300
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

        {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
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
