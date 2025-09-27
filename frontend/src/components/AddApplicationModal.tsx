'use client'

import { useState, FormEvent } from 'react'

interface AddApplicationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (formData: Record<string, any>) => void
  platforms: { id: string; name: string }[]
}

export default function AddApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  platforms
}: AddApplicationModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({})

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

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
          <h3 className="text-xl font-semibold text-white">Add New Application</h3>
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
            <select
              name="platform_id"
              required
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         focus:border-white/50 focus:bg-white/10 focus:outline-none cursor-pointer"
            >
              <option value="">Select Platform (required)</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id} className="bg-neutral-900">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode / Expected Salary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              name="mode"
              required
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         focus:border-white/50 focus:bg-white/10 focus:outline-none cursor-pointer"
            >
              <option value="">Select Mode (required)</option>
              <option value="active">Active</option>
              <option value="passive">Passive</option>
            </select>
            <input
              name="expected_salary"
              type="number"
              placeholder="Expected Salary (optional)"
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />
          </div>

          {/* Salary Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              name="salary_range_min"
              type="number"
              placeholder="Salary Range Min (optional)"
              onChange={handleChange}
              className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white
                         placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
            />
            <input
              name="salary_range_max"
              type="number"
              placeholder="Salary Range Max (optional)"
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
              className="rounded-md border border-white/30 bg-emerald-400 px-6 py-2 font-semibold text-black
                         transition-colors hover:bg-emerald-400/70 disabled:cursor-not-allowed
                         disabled:bg-white/10 disabled:text-white/30 disabled:border-white/10"
            >
              Create Application
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
