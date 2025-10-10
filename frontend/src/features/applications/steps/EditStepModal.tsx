"use client";

import { useEffect, useState } from "react";
import { fetchSupportsSteps, updateApplicationStep } from "../services/applicationStepsService";

interface Step {
  id: number;
  name: string;
}

interface EditStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId?: string; // NEW
  initialData?: {
    id: string; // step record id
    step_id: string;
    step_name?: string;
    step_date: string;
    observation?: string;
  };
  onSuccess?: (data: any) => void;
}

export default function EditStepModal({
  isOpen,
  onClose,
  applicationId,
  initialData,
  onSuccess,
}: EditStepModalProps) {
  const [stepId, setStepId] = useState("");
  const [stepDate, setStepDate] = useState("");
  const [observation, setObservation] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const availableSteps = await fetchSupportsSteps();
          setSteps(availableSteps);
        } catch (err) {
          console.error("Failed to load steps:", err);
        }
      })();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setStepId(initialData.step_id || "");
      setStepDate(initialData.step_date || "");
      setObservation(initialData.observation || "");
    }
  }, [initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId || !initialData?.id) return;

    setLoading(true);
    try {
      const payload = {
        step_id: stepId,
        step_date: stepDate,
        observation,
      };

      const updated = await updateApplicationStep(applicationId, initialData.id, payload);
      onSuccess?.(updated);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="relative w-full max-w-3xl bg-white/5 backdrop-blur-2xl border border-white/20 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] animate-slide-in">
        <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
          <h3 className="text-white text-lg font-semibold">Edit Step</h3>
          <button
            onClick={onClose}
            className="text-white/70 text-2xl font-bold hover:text-white transition-all"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
            <div className="flex flex-col w-full items-center pb-5">
              <select
                value={stepId}
                onChange={(e) => setStepId(e.target.value)}
                className="w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
                required
              >
                <option value="">Select Step</option>
                {steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col w-full items-center pb-5">
              <input
                type="date"
                value={stepDate}
                onChange={(e) => setStepDate(e.target.value)}
                className="w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
                required
              />
            </div>
          </div>

          <div className="flex flex-col w-full items-center pb-5">
            <textarea
              rows={3}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Step details (optional)"
              className="w-4/5 h-[150px] px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 resize-none"
            ></textarea>
          </div>

          <div className="flex justify-end gap-4 border-t border-white/20 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 rounded-lg font-semibold bg-emerald-400/80 border border-white/30 text-black hover:bg-emerald-400 transition-all"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
