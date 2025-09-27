'use client';

import React, { useState, useEffect } from 'react';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-[90%] max-w-3xl bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-lg animate-slideIn">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
          <h3 className="text-white text-lg font-semibold">Edit Application</h3>
          <button
            onClick={onClose}
            className="text-white/70 text-2xl font-bold hover:text-white transition-all"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company & Role Row */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Date & Platform Row */}
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
              required
            />
            <select
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              required
            >
              <option value="">Select Platform (required)</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode & Expected Salary Row */}
          <div className="grid grid-cols-2 gap-4">
            <select
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              required
            >
              <option value="">Select Mode (required)</option>
              <option value="active">Active</option>
              <option value="passive">Passive</option>
            </select>
            <input
              type="number"
              placeholder="Expected Salary (optional)"
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              value={expectedSalary}
              onChange={(e) => setExpectedSalary(Number(e.target.value))}
            />
          </div>

          {/* Salary Range Row */}
          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              placeholder="Salary Range Min (optional)"
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              value={salaryRangeMin}
              onChange={(e) => setSalaryRangeMin(Number(e.target.value))}
            />
            <input
              type="number"
              placeholder="Salary Range Max (optional)"
              className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              value={salaryRangeMax}
              onChange={(e) => setSalaryRangeMax(Number(e.target.value))}
            />
          </div>

          {/* Observation Field */}
          <textarea
            rows={3}
            placeholder="Observation (optional)"
            className="w-full px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all resize-none"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
          ></textarea>

          {/* Footer */}
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              className="bg-green-400/90 hover:bg-green-400/60 text-black font-semibold px-6 py-2 rounded-lg border border-white/30 transition-all"
            >
              Update Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
