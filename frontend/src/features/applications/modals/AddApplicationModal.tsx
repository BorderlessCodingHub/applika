"use client";

import { useState, FormEvent } from "react";
import { Listbox } from "@headlessui/react";
import {
  createApplication,
  CreateApplicationPayload,
} from "@/features/applications/services/applicationsService";
import { mutateApplications } from "@/features/applications/hooks/useApplicationModals";

interface AddApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Record<string, any>) => void;
  platforms: { id: string; name: string }[];
}

const modes = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
];

export default function AddApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  platforms,
}: AddApplicationModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const [selectedPlatform, setSelectedPlatform] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [selectedMode, setSelectedMode] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: CreateApplicationPayload = {
        company: formData.company,
        role: formData.role,
        mode: selectedMode?.id || "",
        platform_id: selectedPlatform ? parseInt(selectedPlatform.id, 10) : 0,
        application_date: formData.application_date,
        observation: formData.observation || undefined,
        expected_salary: formData.expected_salary
          ? parseFloat(formData.expected_salary)
          : undefined,
        salary_range_min: formData.salary_range_min
          ? parseFloat(formData.salary_range_min)
          : undefined,
        salary_range_max: formData.salary_range_max
          ? parseFloat(formData.salary_range_max)
          : undefined,
      };

      const newApp = await createApplication(payload);
      await mutateApplications();
      onSubmit(newApp);
      onClose();
    } catch (err) {
      console.error("Error creating application:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[90%] max-w-5xl rounded-2xl border border-white/20 bg-white/5
                   backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-4 animate-[fadeIn_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/20 px-6 py-4">
          <h3 className="text-xl font-semibold text-white">
            Add New Application
          </h3>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl font-bold transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Company / Role */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              name="company"
              type="text"
              placeholder="Company (required)"
              required
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />
            <input
              name="role"
              type="text"
              placeholder="Role (required)"
              required
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />
          </div>

          {/* Date / Platform */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              name="application_date"
              type="date"
              required
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />

            <Listbox value={selectedPlatform} onChange={setSelectedPlatform}>
              <div className="relative">
                <Listbox.Button
                  className="w-full rounded-md border border-white/30 bg-neutral-900 px-4 py-2 text-white
                             text-left backdrop-blur-sm focus:outline-none cursor-pointer
                             flex justify-between items-center"
                >
                  <span>
                    {selectedPlatform
                      ? selectedPlatform.name
                      : platforms.length === 0
                      ? "Loading platforms..."
                      : "Select Platform (required)"}
                  </span>
                  <i className="fa-solid fa-chevron-down text-white/60 text-xs" />
                </Listbox.Button>

                <Listbox.Options
                  className="absolute z-50 mt-2 w-full max-h-60 overflow-y-auto rounded-md border border-white/20 
             bg-[#1e293b] backdrop-blur-xl text-white shadow-lg scrollbar-thin scrollbar-thumb-white/10 
             scrollbar-track-transparent"
                >
                  {platforms.map((p) => (
                    <Listbox.Option
                      key={p.id}
                      value={p}
                      className={({ active }) =>
                        `cursor-pointer select-none px-4 py-2 ${
                          active ? "bg-gray-900/80" : "bg-gray-800/80"
                        } text-white hover:bg-gray-900/80`
                      }
                    >
                      {p.name}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </Listbox>
          </div>

          {/* Mode / Expected Salary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Listbox value={selectedMode} onChange={setSelectedMode}>
              <div className="relative">
                <Listbox.Button
                  className="w-full rounded-md border border-white/30 bg-neutral-900 px-4 py-2 text-white
                             text-left backdrop-blur-sm focus:outline-none cursor-pointer
                             flex justify-between items-center"
                >
                  <span>
                    {selectedMode
                      ? selectedMode.name
                      : "Select Mode (required)"}
                  </span>
                  <i className="fa-solid fa-chevron-down text-white/60 text-xs" />
                </Listbox.Button>

                <Listbox.Options
                  className="absolute z-50 mt-2 w-full rounded-md border border-white/20 bg-slate-800/70
                             backdrop-blur-xl text-white shadow-lg overflow-hidden"
                >
                  {modes.map((mode) => (
                    <Listbox.Option
                      key={mode.id}
                      value={mode}
                      className={({ active }) =>
                        `cursor-pointer select-none px-4 py-2 ${
                          active ? "bg-gray-900/80" : "bg-gray-800/80"
                        } text-white hover:bg-gray-900/80`
                      }
                    >
                      {mode.name}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </Listbox>

            <input
              name="expected_salary"
              type="number"
              placeholder="Expected Salary (optional)"
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />
          </div>

          {/* Observation */}
          <textarea
            name="observation"
            rows={3}
            placeholder="Observation (optional)"
            onChange={handleChange}
            className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                       placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
          />

          {/* Footer */}
          <div className="flex justify-end border-t border-white/20 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md border border-white/30 bg-emerald-400 px-6 py-2 font-semibold text-black
                         transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed
                         disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
            >
              {loading ? "Creating..." : "Create Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
