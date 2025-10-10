"use client";

import { useState } from "react";
import ModalBase from "../../../components/ui/ModalBase";
import { deleteApplicationStep } from "../services/applicationStepsService";

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

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!applicationId || !stepId) return;

    setLoading(true);
    try {
      await deleteApplicationStep(applicationId, stepId);
      onSuccess?.(stepId);
      onClose();
    } catch (err) {
      console.error("Error deleting step:", err);
      alert("Failed to delete step.");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <button
      onClick={handleDelete}
      disabled={loading}
      className={`rounded-lg border border-red-600 bg-red-600/80 px-6 py-2 text-white transition-colors hover:bg-red-600 ${
        loading ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {loading ? "Deleting..." : "Delete Step"}
    </button>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      title="Delete Step"
      onClose={onClose}
      footer={footer}
    >
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
      </div>
    </ModalBase>
  );
}
