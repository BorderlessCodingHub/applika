"use client";

import { useEffect, useState } from "react";
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
  initialData?: EditApplicationFormData & { id: string };
  onSubmit: (data: EditApplicationFormData) => void;
}

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [mode, setMode] = useState("");
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
    setPlatformId(initialData.platform_id?.toString() || "");
    setMode(initialData.mode || "");
    setExpectedSalary(initialData.expected_salary?.toString() || "");
    setSalaryRangeMin(initialData.salary_range_min?.toString() || "");
    setSalaryRangeMax(initialData.salary_range_max?.toString() || "");
    setObservation(initialData.observation || "");
  }, [initialData]);

  const handleSubmit = async () => {
    if (!initialData?.id) return;
    setLoading(true);

    try {
      const payload = {
        company,
        role,
        application_date: applicationDate,
        platform_id: platformId ? Number(platformId) : undefined,
        mode: mode as "active" | "passive",
        expected_salary: expectedSalary,
        salary_range_min: salaryRangeMin,
        salary_range_max: salaryRangeMax,
        observation,
      };

      // Validate before sending
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
      // Optional: show toast or notice that update may have applied despite error
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
          className="rounded-md border border-white/30 bg-emerald-400 px-6 py-2 font-semibold text-black transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
        >
          {loading ? "Updating..." : "Update Application"}
        </button>
      }
    >
      <div className="space-y-4">
        {/* Company / Role */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="company"
            type="text"
            placeholder="Company (required)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            name="role"
            type="text"
            placeholder="Role (required)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        {/* Date / Platform */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="application_date"
            type="date"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <select
            name="platform_id"
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            required
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
          >
            <option value="">
              {platforms.length === 0
                ? "Loading platforms..."
                : "Select Platform"}
            </option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mode / Expected Salary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "active" | "passive")}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
          >
            <option value="">Select Mode</option>
            <option value="active">Active</option>
            <option value="passive">Passive</option>
          </select>
          <input
            name="expected_salary"
            type="number"
            placeholder="Expected Salary (optional)"
            value={expectedSalary}
            onChange={(e) => setExpectedSalary(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        {/* Salary Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="salary_range_min"
            type="number"
            placeholder="Salary Range Min (optional)"
            value={salaryRangeMin}
            onChange={(e) => setSalaryRangeMin(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            name="salary_range_max"
            type="number"
            placeholder="Salary Range Max (optional)"
            value={salaryRangeMax}
            onChange={(e) => setSalaryRangeMax(e.target.value)}
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        {/* Observation */}
        <textarea
          name="observation"
          rows={3}
          placeholder="Observation (optional)"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all resize-none"
        />
      </div>
    </ModalBase>
  );
}
