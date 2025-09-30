import React, { useState, useEffect } from 'react';
import ModalBase from '../../../components/ui/ModalBase';

type Step = { id: string; name: string };

interface EditStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  initialData?: {
    step_id: string;
    step_date: string;
    observation?: string;
  };
  onSubmit: (data: any) => void;
}

export default function EditStepModal({
  isOpen,
  onClose,
  steps,
  initialData,
  onSubmit,
}: EditStepModalProps) {
  const [stepId, setStepId] = useState('');
  const [stepDate, setStepDate] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (initialData) {
      setStepId(initialData.step_id || '');
      setStepDate(initialData.step_date || '');
      setObservation(initialData.observation || '');
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ step_id: stepId, step_date: stepDate, observation });
  };

  return (
    <ModalBase
      isOpen={isOpen}
      title="Edit Step"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="edit-step-form"
          className="bg-green-400/90 hover:bg-green-400/60 text-black font-semibold px-6 py-2 rounded-lg border border-white/30 transition-all"
        >
          Update Step
        </button>
      }
    >
      <form id="edit-step-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Step & Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all cursor-pointer"
            value={stepId}
            onChange={(e) => setStepId(e.target.value)}
            required
          >
            <option value="">Select Step</option>
            {steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
            value={stepDate}
            onChange={(e) => setStepDate(e.target.value)}
            required
          />
        </div>

        {/* Observation */}
        <textarea
          rows={3}
          placeholder="Optional observation"
          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all resize-none"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
        />
      </form>
    </ModalBase>
  );
}
