"use client";

import { useState } from "react";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import { addApplicationStep } from "../services/applicationStepsService";
import { AddStepPayload } from "@/features/applications/schemas/applicationsStepsSchema";
import { mutateSteps } from "@/features/applications/hooks/useApplicationModals";
import ModalBase from "@/components/ui/ModalBase";

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
  loadingSteps?: boolean;
}

export default function AddStepModal({
  isOpen,
  onClose,
  steps,
  applicationId,
  applicationInfo,
  onSuccess,
  loadingSteps = false,
}: AddStepModalProps) {
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [stepDate, setStepDate] = useState("");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStep) {
      setError("Please select a step before submitting.");
      return;
    }
    if (!stepDate) {
      setError("Please choose a valid date.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: AddStepPayload = {
        step_id: selectedStep.id,
        step_date: stepDate,
        observation,
      };

      const data = await addApplicationStep(applicationId, payload);
      await mutateSteps(applicationId);
      onSuccess?.(data);

      setSelectedStep(null);
      setStepDate("");
      setObservation("");
      onClose();
    } catch (err) {
      setError("Failed to add step. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <button
      type="submit"
      disabled={loading || loadingSteps}
      onClick={(e) => handleSubmit(e as any)}
      className="w-full md:w-auto px-8 py-3 rounded-lg font-semibold bg-emerald-400/80 border border-white/30 text-black hover:bg-emerald-400 transition-all"
    >
      {loading ? "Adding..." : "Add Step"}
    </button>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      title="Add Step"
      onClose={onClose}
      footer={footer}
    >
      {applicationInfo && (
        <p className="text-white/80 mb-4">{applicationInfo}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
          <div className="relative w-full flex justify-center pb-5">
            <ListBoxSelect
              value={selectedStep}
              onChange={setSelectedStep}
              options={steps}
              placeholder="Select Step"
              loading={loadingSteps}
              disabled={loadingSteps}
            />
            {loadingSteps && (
              <div className="absolute right-[35%] top-2.5 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
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
          />
        </div>
      </form>
    </ModalBase>
  );
}
