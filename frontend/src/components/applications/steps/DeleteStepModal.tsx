import React from "react";
import ModalBase from "../../ui/ModalBase";

interface DeleteStepModalProps {
  isOpen: boolean;
  stepName: string;
  stepDate: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteStepModal({
  isOpen,
  stepName,
  stepDate,
  onClose,
  onConfirm,
}: DeleteStepModalProps) {
  return (
    <ModalBase
      isOpen={isOpen}
      title="Delete Step"
      onClose={onClose}
      footer={
        <button
          onClick={onConfirm}
          className="rounded-lg border border-red-600 bg-red-600/80 px-6 py-2 text-white transition-colors hover:bg-red-600"
        >
          Delete Step
        </button>
      }
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
