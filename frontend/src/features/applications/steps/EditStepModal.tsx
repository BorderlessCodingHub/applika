"use client";

import { useEffect, useState } from "react";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import { updateApplicationStep } from "../services/applicationStepsService";
import { mutateSteps } from "@/features/applications/hooks/useApplicationSteps";
import { UpdateStepPayload } from "@/features/applications/schemas/applicationsStepsSchema";

interface Step {
  id: number;
  name: string;
}

interface EditStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  loadingSteps?: boolean;
  applicationId?: string;
  initialData?: {
    id: number;
    step_id: number;
    step_name?: string;
    step_date: string;
    observation?: string;
  };
  onSuccess?: (data: any) => void;
}

export default function EditStepModal({
  isOpen,
  onClose,
  steps,
  loadingSteps = false,
  applicationId,
  initialData,
  onSuccess,
}: EditStepModalProps) {
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [stepDate, setStepDate] = useState("");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialData) {
      setSelectedStep(null);
      setStepDate("");
      setObservation("");
      return;
    }

    setStepDate(initialData.step_date || "");
    setObservation(initialData.observation || "");

    const matched = steps.find((s) => s.id === initialData.step_id);
    if (matched) {
      setSelectedStep(matched);
    } else if (initialData.step_name) {
      setSelectedStep({ id: initialData.step_id, name: initialData.step_name });
    }
  }, [initialData, steps]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!applicationId || !initialData?.id) return;

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
      const payload: UpdateStepPayload = {
        step_id: selectedStep.id,
        step_date: stepDate,
        observation,
      };

      const updated = await updateApplicationStep(
        applicationId,
        initialData.id,
        payload
      );

      await mutateSteps(applicationId);
      onSuccess?.(updated);
      onClose();
    } catch {
      setError("Failed to update step. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBase isOpen={isOpen} title="Edit Step" onClose={onClose}>
      {error && (
        <p className="text-red-400 text-sm text-center mb-2">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
          <div className="relative w-full flex justify-center pb-5">
            <ListBoxSelect
              value={selectedStep}
              onChange={setSelectedStep}
              options={steps}
              placeholder={loadingSteps ? "Loading steps..." : "Select Step"}
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

        <ModalFooter
          onCancel={onClose}
          submitLabel="Save Changes"
          loading={loading}
          disabled={loadingSteps}
        />
      </form>
    </ModalBase>
  );
}
