"use client";

interface ModalSkeletonProps {
  numFields?: number;      // How many input/dropdown fields to render
  showTextarea?: boolean;   // Show a textarea placeholder
  showFooter?: boolean;     // Show footer buttons
}

export default function ModalSkeleton({
  numFields = 2,
  showTextarea = true,
  showFooter = true,
}: ModalSkeletonProps) {
  return (
    <div className="animate-pulse space-y-5 px-4 md:px-8 py-6">
      {/* Header */}
      <div className="h-6 w-1/3 bg-white/20 rounded mb-4" />

      {/* Input / Dropdown fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
        {Array.from({ length: numFields }).map((_, i) => (
          <div
            key={i}
            className="w-4/5 md:w-3/5 h-10 bg-white/10 rounded-lg"
          />
        ))}
      </div>

      {/* Textarea */}
      {showTextarea && (
        <div className="flex justify-center mt-4">
          <div className="w-4/5 h-[150px] bg-white/10 rounded-xl" />
        </div>
      )}

      {/* Footer */}
      {showFooter && (
        <div className="flex justify-end gap-4 mt-6">
          <div className="h-10 w-24 bg-white/20 rounded-lg" />
          <div className="h-10 w-32 bg-white/30 rounded-lg" />
        </div>
      )}
    </div>
  );
}
