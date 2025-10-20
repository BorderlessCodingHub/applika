"use client";

import { useEffect, useState, Fragment } from "react";
import ModalBase from "@/components/ui/ModalBase";
import {
  editApplicationSchema,
  EditApplicationFormData,
} from "@/features/applications/schemas/applicationSchema";
import { updateApplication } from "@/features/applications/services/applicationsService";
import { mutateApplications } from "@/features/applications/hooks/useApplications";
import ListBoxSelect from "@/components/ui/ListBoxSelect";

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

  const footer = (
    <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full md:w-auto rounded-md border border-white/30 bg-emerald-400 px-6 py-2 font-semibold text-black 
                     transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed 
                     disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
        >
          {loading ? "Updating..." : "Update Application"}
        </button>
  );

  if (!isOpen) return null;

  return (
    <ModalBase
      isOpen={isOpen}
      title="Edit Application"
      onClose={onClose}
      footer={footer}
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
            <ListBoxSelect
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              options={platforms}
              placeholder="Select Platform"
              loading={loadingPlatforms}
              disabled={platforms.length === 0 || loadingPlatforms}
            />

            {(platforms.length === 0 || loadingPlatforms) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <ListBoxSelect
              value={selectedMode}
              onChange={setSelectedMode}
              options={modes}
              placeholder="Select Mode"
              loading={false}
              disabled={modes.length === 0}
            />

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
