"use client";

import { useState } from "react";
import {
  addApplicationStep,
  type AddStepPayload,
} from "../services/applicationStepsService";
import { mutateSteps } from "@/features/applications/hooks/useApplicationModals";

interface Step {
  id: number;
  name: string;
}

interface AddStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  applicationId: string;
  applicationInfo?: string;
  onSuccess?: (data: any) => void;
}

export default function AddStepModalClient({
  isOpen,
  onClose,
  steps,
  applicationId,
  applicationInfo,
  onSuccess,
}: AddStepModalProps) {
  const [stepId, setStepId] = useState("");
  const [stepDate, setStepDate] = useState("");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: AddStepPayload = {
        step_id: stepId,
        step_date: stepDate,
        observation,
      };

      const data = await addApplicationStep(applicationId, payload);

      // ✅ Revalidate only this application's steps
      await mutateSteps(applicationId);

      onSuccess?.(data);
      setStepId("");
      setStepDate("");
      setObservation("");
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
          <h3 className="text-white text-lg font-semibold">Add Step</h3>
          <button
            onClick={onClose}
            className="text-white/70 text-2xl font-bold hover:text-white transition-all"
          >
            &times;
          </button>
        </div>

        {applicationInfo && (
          <p className="text-white/80 mb-4">{applicationInfo}</p>
        )}

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
              {loading ? "Adding..." : "Add Step"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
