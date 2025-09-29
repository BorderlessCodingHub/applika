import React, { useEffect, useState } from 'react';
import ModalBase from '../../ui/ModalBase';

type Platform = { id: string; name: string };

interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: Platform[];
  initialData?: {
    company: string;
    role: string;
    application_date: string;
    platform_id: string;
    mode: string;
    expected_salary?: number;
    salary_range_min?: number;
    salary_range_max?: number;
    observation?: string;
  };
  onSubmit: (data: any) => void;
}

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [applicationDate, setApplicationDate] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [mode, setMode] = useState('');
  const [expectedSalary, setExpectedSalary] = useState<number | ''>('');
  const [salaryRangeMin, setSalaryRangeMin] = useState<number | ''>('');
  const [salaryRangeMax, setSalaryRangeMax] = useState<number | ''>('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (initialData) {
      setCompany(initialData.company || '');
      setRole(initialData.role || '');
      setApplicationDate(initialData.application_date || '');
      setPlatformId(initialData.platform_id || '');
      setMode(initialData.mode || '');
      setExpectedSalary(initialData.expected_salary || '');
      setSalaryRangeMin(initialData.salary_range_min || '');
      setSalaryRangeMax(initialData.salary_range_max || '');
      setObservation(initialData.observation || '');
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      company,
      role,
      application_date: applicationDate,
      platform_id: platformId,
      mode,
      expected_salary: expectedSalary,
      salary_range_min: salaryRangeMin,
      salary_range_max: salaryRangeMax,
      observation,
    });
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
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            required
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
            required
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
            onChange={(e) =>
              setExpectedSalary(e.target.value ? Number(e.target.value) : '')
            }
          />
        </div>

        {/* Salary Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="number"
            placeholder="Salary Range Min"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={salaryRangeMin}
            onChange={(e) =>
              setSalaryRangeMin(e.target.value ? Number(e.target.value) : '')
            }
          />
          <input
            type="number"
            placeholder="Salary Range Max"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={salaryRangeMax}
            onChange={(e) =>
              setSalaryRangeMax(e.target.value ? Number(e.target.value) : '')
            }
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
