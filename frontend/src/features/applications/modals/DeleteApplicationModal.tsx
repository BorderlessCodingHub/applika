"use client";

import React, { useState } from "react";
import { mutateApplications } from "@/features/applications/hooks/useApplicationModals";

interface DeleteApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>; // expects async delete function
  applicationId: string; // pass the ID of the application to delete
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
      await onDelete(applicationId); // use the passed delete function
      await mutateApplications();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center transition-opacity ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible"
      }`}
    >
      <div className="relative w-[90%] max-w-[1200px] bg-white/5 backdrop-blur-[20px] border border-white/20 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] animate-[modalSlideIn_0.3s_ease-out]">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
          <h3 className="text-white m-0">Delete Application</h3>
          <span
            className="text-white/70 text-2xl font-bold cursor-pointer hover:text-white transition-all"
            onClick={onClose}
          >
            &times;
          </span>
        </div>

        {/* Body */}
        <div className="p-6 text-center">
          <p className="text-white text-lg">
            Are you sure you want to delete this application?
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 border-t border-white/20 pt-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className={`${
              isDeleting ? "opacity-50 cursor-not-allowed" : "hover:bg-red-600"
            } bg-red-600/80 text-white border border-red-600 px-6 py-3 rounded-lg font-semibold transition-all duration-300`}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 text-white border border-white/30 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all duration-300 hover:bg-white/20"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
