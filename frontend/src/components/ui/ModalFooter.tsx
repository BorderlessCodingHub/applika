import React from "react";

interface ModalFooterProps {
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "danger";
  submitType?: "button" | "submit";
}

export default function ModalFooter({
  onSubmit,
  onCancel,
  submitLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  disabled = false,
  variant = "default",
  submitType = "submit",
}: ModalFooterProps) {
  return (
    <div
      className={`border-t border-white/20 mt-8 pt-6 flex flex-col sm:flex-row justify-end gap-4`}
    >
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full md:w-auto px-8 py-3 rounded-lg font-semibold text-white/80 border border-white/30 hover:bg-white/10 transition-all"
        >
          {cancelLabel}
        </button>
      )}

      <button
        type={submitType}
        onClick={submitType === "button" ? onSubmit : undefined}
        disabled={loading || disabled}
        className={`w-full md:w-auto px-8 py-3 rounded-lg font-semibold border border-white/30 transition-all
          ${
            variant === "danger"
              ? "bg-red-500/80 hover:bg-red-500 text-white"
              : "bg-emerald-400/80 hover:bg-emerald-400 text-black"
          }`}
      >
        {loading ? "Processing..." : submitLabel}
      </button>
    </div>
  );
}
