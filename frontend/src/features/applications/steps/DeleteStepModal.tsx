// src/features/applications/steps/DeleteStepModal.tsx
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";

const deleteStepSchema = z.object({
  confirm: z.literal(true, {
    message: "You must confirm before deleting.",
  }),
});

type DeleteStepPayload = z.infer<typeof deleteStepSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  stepId: string;
  stepName?: string;
  stepDate?: string;
  // parent should perform API/mutation
  onSubmit?: () => Promise<void> | void;
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
  const {
    handleSubmit,
    register,
    formState: { isSubmitting },
  } = useForm<DeleteStepPayload>({
    resolver: zodResolver(deleteStepSchema),
    defaultValues: { confirm: true },
  });

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Step"
      variant="danger"
    >
      <form
        onSubmit={handleSubmit(async () => {
          await onSubmit?.();
        })}
        className="space-y-6"
      >
        {/* hidden input so zod/reducer has the confirm value registered (keeps same pattern as DeleteApplicationModal) */}
        <input type="hidden" {...register("confirm")} />

        <div className="p-6 text-center">
          <p className="text-white text-lg">
            Are you sure you want to delete step{" "}
            <span className="font-semibold text-red-400">
              {stepName ?? stepId}
            </span>
            ?{" "}
            <span className="block text-sm text-white/60 mt-1">
              {stepDate ?? `${applicationId} • step ${stepId}`}
            </span>
          </p>
        </div>

        <ModalFooter
          onCancel={onClose}
          submitLabel="Delete Step"
          cancelLabel="Cancel"
          loading={isSubmitting || loading}
          variant="danger"
        />
      </form>
    </ModalBase>
  );
}
