// src/features/applications/steps/DeleteStepModal.tsx
"use client";

import React from "react";
import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  stepId: string;
  stepName?: string;
  stepDate?: string;
  // parent should perform API/mutation
  onSubmit: () => Promise<void> | void;
  loading?: boolean;
}

export default function DeleteStepModal({
  isOpen,
  onClose,
  applicationId,
  stepId,
  stepName,
  stepDate,
  onSubmit,
  loading = false,
}: Props) {
  if (!isOpen) return null;

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Step"
      variant="danger"
    >
      <div className="p-6 text-center">
        <p className="text-white text-lg">
          Are you sure you want to delete step{" "}
          <span className="font-semibold text-red-400">
            {stepName ?? stepId}
          </span>
          {stepDate ? (
            <span className="block text-sm text-white/60 mt-1">{stepDate}</span>
          ) : null}
        </p>
      </div>

      <div className="px-6 pb-6">
        <ModalFooter
          onCancel={onClose}
          submitLabel="Delete Step"
          cancelLabel="Cancel"
          loading={loading}
          variant="danger"
          // When the Delete button is clicked, call parent then close
          onSubmit={async () => {
            await onSubmit();
            onClose();
          }}
        />
      </div>
    </ModalBase>
  );
}
