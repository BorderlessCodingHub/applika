"use client";

import { useEffect, useState, Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import ModalBase from "@/components/ui/ModalBase";
import {
  editApplicationSchema,
  EditApplicationFormData,
} from "@/features/applications/schemas/applicationSchema";
import { updateApplication } from "@/features/applications/services/applicationsService";
import { mutateApplications } from "@/features/applications/hooks/useApplicationModals";

interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: string; name: string }[];
  loadingPlatforms?: boolean; // new prop
  initialData?: EditApplicationFormData & { id: string };
  onSubmit: (data: EditApplicationFormData) => void;
}

const modes = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
];

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms,
  loadingPlatforms = false,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedMode, setSelectedMode] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expectedSalary, setExpectedSalary] = useState("");
  const [salaryRangeMin, setSalaryRangeMin] = useState("");
  const [salaryRangeMax, setSalaryRangeMax] = useState("");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialData) return;
    setCompany(initialData.company || "");
    setRole(initialData.role || "");
    setApplicationDate(initialData.application_date || "");
    setSelectedPlatform(
      initialData.platform_id
        ? platforms.find((p) => p.id === String(initialData.platform_id)) ||
            null
        : null
    );
    setSelectedMode(modes.find((m) => m.id === initialData.mode) || null);
    setExpectedSalary(initialData.expected_salary?.toString() || "");
    setSalaryRangeMin(initialData.salary_range_min?.toString() || "");
    setSalaryRangeMax(initialData.salary_range_max?.toString() || "");
    setObservation(initialData.observation || "");
  }, [initialData, platforms]);

  const handleSubmit = async () => {
    if (!initialData?.id) return;
    setLoading(true);

    try {
      const payload = {
        company,
        role,
        application_date: applicationDate,
        platform_id: selectedPlatform ? Number(selectedPlatform.id) : undefined,
        mode: selectedMode?.id as "active" | "passive" | undefined,
        expected_salary: expectedSalary,
        salary_range_min: salaryRangeMin,
        salary_range_max: salaryRangeMax,
        observation,
      };

      const parsed = editApplicationSchema.parse(payload);
      const updated = await updateApplication(initialData.id, parsed);

      await mutateApplications();
      onSubmit(updated);
      onClose();
    } catch (err) {
      console.error(
        "Validation or API error (may be 500 but update applied):",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalBase
      isOpen={isOpen}
      title="Edit Application"
      onClose={onClose}
      footer={
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-md border border-white/30 bg-emerald-400 px-6 py-2 font-semibold text-black 
                     transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed 
                     disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
        >
          {loading ? "Updating..." : "Update Application"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="company"
            type="text"
            placeholder="Company (required)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            name="role"
            type="text"
            placeholder="Role (required)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <input
            name="application_date"
            type="date"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />

          <div className="relative">
            <Listbox
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              disabled={platforms.length === 0 || loadingPlatforms}
            >
              <div className="relative">
                <Listbox.Button
                  className={`w-full rounded-md border border-white/30 bg-neutral-900  px-4 py-2 text-white text-left 
                      backdrop-blur-sm focus:outline-none cursor-pointer flex justify-between items-center`}
                >
                  <span>
                    {platforms.length === 0 || loadingPlatforms
                      ? "Loading platforms..."
                      : selectedPlatform
                      ? selectedPlatform.name
                      : "Select Platform"}
                  </span>
                  <i className="fa-solid fa-chevron-down text-white/60 text-xs" />
                </Listbox.Button>

                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options
                    className="absolute z-50 mt-2 w-full max-h-60 overflow-y-auto rounded-md border border-white/20 
                       bg-[#1e293b]/90 backdrop-blur-xl text-white shadow-lg scrollbar-thin 
                       scrollbar-thumb-white/10 scrollbar-track-transparent"
                  >
                    {platforms.length === 0 || loadingPlatforms ? (
                      <div className="px-4 py-2 text-white/70">Loading...</div>
                    ) : (
                      platforms.map((p) => (
                        <Listbox.Option
                          key={p.id}
                          value={p}
                          className={({ active }) =>
                            `cursor-pointer select-none px-4 py-2 ${
                              active ? "bg-gray-900/80" : "bg-gray-800/70"
                            } text-white hover:bg-gray-900/80`
                          }
                        >
                          {p.name}
                        </Listbox.Option>
                      ))
                    )}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>

            {(platforms.length === 0 || loadingPlatforms) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Listbox
              value={selectedMode}
              onChange={setSelectedMode}
              disabled={loadingPlatforms}
            >
              <div className="relative">
                <Listbox.Button
                  className="w-full rounded-md border border-white/30 bg-neutral-900  px-4 py-2 text-white text-left 
                     backdrop-blur-sm focus:outline-none cursor-pointer flex justify-between items-center"
                >
                  <span>
                    {selectedMode ? selectedMode.name : "Select Mode"}
                  </span>
                  <i className="fa-solid fa-chevron-down text-white/60 text-xs" />
                </Listbox.Button>

                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options
                    className="absolute z-50 mt-2 w-full rounded-md border border-white/20 bg-[#1e293b]/90 
                       backdrop-blur-xl text-white shadow-lg overflow-hidden"
                  >
                    {modes.map((mode) => (
                      <Listbox.Option
                        key={mode.id}
                        value={mode}
                        className={({ active }) =>
                          `cursor-pointer select-none px-4 py-2 ${
                            active ? "bg-gray-900/80" : "bg-gray-800/70"
                          } text-white hover:bg-gray-900/80`
                        }
                      >
                        {mode.name}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>

            {loadingPlatforms && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
          </div>

          <input
            name="expected_salary"
            type="number"
            placeholder="Expected Salary (optional)"
            value={expectedSalary}
            onChange={(e) => setExpectedSalary(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="salary_range_min"
            type="number"
            placeholder="Salary Range Min (optional)"
            value={salaryRangeMin}
            onChange={(e) => setSalaryRangeMin(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            name="salary_range_max"
            type="number"
            placeholder="Salary Range Max (optional)"
            value={salaryRangeMax}
            onChange={(e) => setSalaryRangeMax(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <textarea
          name="observation"
          rows={3}
          placeholder="Observation (optional)"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white 
                     placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
        />
      </div>
    </ModalBase>
  );
}
