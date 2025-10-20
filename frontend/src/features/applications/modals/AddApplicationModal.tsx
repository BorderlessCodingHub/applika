import { useState, FormEvent } from "react";
import {
  createApplication,
  CreateApplicationPayload,
} from "@/features/applications/services/applicationsService";
import { mutateApplications } from "@/features/applications/hooks/useApplications";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import ModalBase from "@/components/ui/ModalBase";

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

  const footer = (
    <button
      type="submit"
      disabled={loading}
      className="w-full md:w-auto rounded-md border border-white/30 bg-emerald-400 px-6 py-3 font-semibold text-black 
                 transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed 
                 disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
    >
      {loading ? "Creating..." : "Create Application"}
    </button>
  );

  if (!isOpen) return null;

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Application"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="application_date"
            type="date"
            required
            onChange={handleChange}
            className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         focus:border-white/50 focus:bg-white/10 focus:outline-none"
          />

          <ListBoxSelect
            value={selectedPlatform}
            onChange={setSelectedPlatform}
            options={platforms}
            placeholder={
              platforms.length === 0
                ? "Loading platforms..."
                : "Select Platform (required)"
            }
            loading={platforms.length === 0}
            disabled={platforms.length === 0}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ListBoxSelect
            value={selectedMode}
            onChange={setSelectedMode}
            options={modes}
            placeholder="Select Mode (required)"
            loading={false}
            disabled={false}
          />

          <input
            name="expected_salary"
            type="number"
            placeholder="Expected Salary (optional)"
            onChange={handleChange}
            className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
          />
        </div>

        <textarea
          name="observation"
          rows={3}
          placeholder="Observation (optional)"
          onChange={handleChange}
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                       placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
        />
      </form>
    </ModalBase>
  );
}
