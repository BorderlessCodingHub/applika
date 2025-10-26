import React, { ReactNode } from "react";
import ModalBase from "./ModalBase";
import ModalSkeleton from "./ModalSkeleton"; // your existing skeleton

interface ModalWithSkeletonProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  loading?: boolean;
  children: ReactNode;
  numFields?: number; // optional config for skeleton
  showTextarea?: boolean;
  variant?: "default" | "danger";
}

export default function ModalWithSkeleton({
  isOpen,
  onClose,
  title,
  loading = false,
  children,
  numFields = 2,
  showTextarea = true,
  variant = "default",
}: ModalWithSkeletonProps) {
  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant={variant}
    >
      {loading ? (
        <ModalSkeleton numFields={numFields} showTextarea={showTextarea} />
      ) : (
        children
      )}
    </ModalBase>
  );
}
