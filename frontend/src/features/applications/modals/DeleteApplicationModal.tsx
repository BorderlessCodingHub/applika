"use client";

import React, { useState } from "react";
import { mutateApplications } from "@/features/applications/hooks/useApplications";
import ModalBase from "@/components/ui/ModalBase";

interface DeleteApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  applicationId: string;
}

export default function DeleteApplicationModal({
  isOpen,
  onClose,
  onDelete,
  applicationId,
}: DeleteApplicationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      await onDelete(applicationId);
      await mutateApplications();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className={`w-full sm:w-auto ${
          isDeleting ? "opacity-50 cursor-not-allowed" : "hover:bg-red-600"
        } bg-red-600/80 text-white border border-red-600 px-6 py-3 rounded-lg font-semibold transition-all duration-300`}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>

      <button
        type="button"
        onClick={onClose}
        className="w-full sm:w-auto bg-white/10 text-white border border-white/30 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all duration-300 hover:bg-white/20"
      >
        Cancel
      </button>
    </>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Application"
      footer={footer}
      variant="danger"
    >
      <div className="p-6 text-center">
        <p className="text-white text-lg">
          Are you sure you want to delete this application?
        </p>
      </div>
    </ModalBase>
  );
}
