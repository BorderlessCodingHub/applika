import React, { useEffect, useState } from "react";
import ModalBase from "../../../components/ui/ModalBase";
import { z } from "zod";
import {
  applicationFormSchema,
  ApplicationFormData,
} from "@/features/applications/schemas/applicationSchema";

// ---- Form Schema ----
const EditApplicationSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  application_date: z.string(),
  platform_id: z.string().optional(),
  mode: z.enum(["active", "passive"]).optional(),
  expected_salary: z.string().optional(),
  salary_range_min: z.string().optional(),
  salary_range_max: z.string().optional(),
  observation: z.string().optional(),
});

export type EditApplicationFormData = z.infer<typeof EditApplicationSchema>;

export interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: string; name: string }[];
  initialData?: ApplicationFormData;
  onSubmit: (data: ApplicationFormData) => void;
}

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  // ---- Form States (sempre string) ----
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [mode, setMode] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [salaryRangeMin, setSalaryRangeMin] = useState("");
  const [salaryRangeMax, setSalaryRangeMax] = useState("");
  const [observation, setObservation] = useState("");

  // ---- Preenche dados iniciais ----
  useEffect(() => {
    if (initialData) {
      setCompany(initialData.company || "");
      setRole(initialData.role || "");
      setApplicationDate(initialData.application_date || "");
      setPlatformId(
        initialData.platform_id ? String(initialData.platform_id) : ""
      );
      setMode(initialData.mode || "");
      setExpectedSalary(
        initialData.expected_salary ? String(initialData.expected_salary) : ""
      );
      setSalaryRangeMin(
        initialData.salary_range_min ? String(initialData.salary_range_min) : ""
      );
      setSalaryRangeMax(
        initialData.salary_range_max ? String(initialData.salary_range_max) : ""
      );
      setObservation(initialData.observation || "");
    }
  }, [initialData]);

  // ---- Submit Handler ----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const rawData = {
      company,
      role,
      application_date: applicationDate,
      platform_id: platformId, // still string here
      mode,
      expected_salary: expectedSalary,
      salary_range_min: salaryRangeMin,
      salary_range_max: salaryRangeMax,
      observation,
    };

    const parsed = applicationFormSchema.parse(rawData); // ✅ Zod validation + conversion
    parsed.platform_id = parsed.platform_id
      ? Number(parsed.platform_id)
      : undefined;

    onSubmit(parsed);
  };

  return (
    <ModalBase
      isOpen={isOpen}
      title="Edit Application"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="edit-application-form"
          className="bg-green-400/90 hover:bg-green-400/60 text-black font-semibold px-6 py-2 rounded-lg border border-white/30 transition-all"
        >
          Update Application
        </button>
      }
    >
      <form
        id="edit-application-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Company & Role */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Company (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Role (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          />
        </div>

        {/* Date & Platform */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="date"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
            required
          />
          <select
          className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
            required
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
          >
            <option value="">Select Platform</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mode & Expected Salary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">Select Mode</option>
            <option value="active">Active</option>
            <option value="passive">Passive</option>
          </select>
          <input
            type="number"
            placeholder="Expected Salary (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={expectedSalary}
            onChange={(e) => setExpectedSalary(e.target.value)}
          />
        </div>

        {/* Salary Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="number"
            placeholder="Salary Range Min"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={salaryRangeMin}
            onChange={(e) => setSalaryRangeMin(e.target.value)}
          />
          <input
            type="number"
            placeholder="Salary Range Max"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={salaryRangeMax}
            onChange={(e) => setSalaryRangeMax(e.target.value)}
          />
        </div>

        {/* Observation */}
        <textarea
          rows={3}
          placeholder="Observation (optional)"
          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all resize-none"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
        />
      </form>
    </ModalBase>
  );
}
