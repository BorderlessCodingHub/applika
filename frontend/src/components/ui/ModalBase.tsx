import React from 'react';

interface ModalBaseProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function ModalBase({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: ModalBaseProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-[90%] max-w-3xl bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-lg animate-slideIn">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
          <h3 className="text-white text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/70 text-2xl font-bold hover:text-white transition-colors"
            aria-label="Close Modal"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div>{children}</div>

        {/* Footer */}
        {footer && <div className="flex justify-end mt-6">{footer}</div>}
      </div>
    </div>
  );
}
