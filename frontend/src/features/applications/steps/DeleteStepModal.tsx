"use client";

import { useState } from "react";
import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import { deleteApplicationStep } from "../services/applicationStepsService";
import { mutateSteps } from "@/features/applications/hooks/useApplicationSteps";

interface DeleteStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  stepId: string;
  stepName: string;
  stepDate: string;
  onSuccess?: (deletedStepId: string) => void;
}

export default function DeleteStepModal({
  isOpen,
  onClose,
  applicationId,
  stepId,
  stepName,
  stepDate,
  onSuccess,
}: DeleteStepModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!applicationId || !stepId) return;

    setLoading(true);
    setError(null);

    try {
      await deleteApplicationStep(applicationId, stepId);
      await mutateSteps(applicationId);
      onSuccess?.(stepId);
      onClose();
    } catch {
      setError("Failed to delete step. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      title="Delete Step"
      onClose={onClose}
      variant="danger"
    >
      <form onSubmit={handleDelete}>
        <div className="text-white space-y-3">
          <p>Are you sure you want to delete this step?</p>

          <div className="space-y-1">
            <p>
              <strong>Step:</strong> <span>{stepName}</span>
            </p>
            <p>
              <strong>Date:</strong> <span>{stepDate}</span>
            </p>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>

        <ModalFooter
          onCancel={onClose}
          submitLabel="Delete Step"
          loading={loading}
          variant="danger"
        />
      </form>
    </ModalBase>
  );
}
