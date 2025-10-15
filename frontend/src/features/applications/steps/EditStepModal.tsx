"use client";

import { useEffect, useState } from "react";
import ModalBase from "../../../components/ui/ModalBase";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import {
  fetchSupportsSteps,
  updateApplicationStep,
} from "../services/applicationStepsService";
import { mutateSteps } from "@/features/applications/hooks/useApplicationModals";

interface Step {
  id: number;
  name: string;
}

interface EditStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId?: string;
  initialData?: {
    id: string;
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
  const [loadingSteps, setLoadingSteps] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          setLoadingSteps(true);
          const availableSteps = await fetchSupportsSteps();
          setSteps(availableSteps);
        } finally {
          setLoadingSteps(false);
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
      const payload = { step_id: stepId, step_date: stepDate, observation };
      const updated = await updateApplicationStep(
        applicationId,
        initialData.id,
        payload
      );
      await mutateSteps(applicationId);
      onSuccess?.(updated);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <button
      type="submit"
      onClick={(e) => handleSubmit(e as any)}
      disabled={loading || loadingSteps}
      className={`px-8 py-3 rounded-lg font-semibold bg-emerald-400/80 border border-white/30 text-black hover:bg-emerald-400 transition-all ${
        loading || loadingSteps ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {loading ? "Saving..." : "Save Changes"}
    </button>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      title="Edit Step"
      onClose={onClose}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
          <div className="relative w-full flex justify-center pb-5">
            <ListBoxSelect
              value={stepId}
              onChange={setStepId}
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
