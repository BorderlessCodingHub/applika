"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import ModalSkeleton from "@/components/ui/ModalSkeleton";

const deleteApplicationSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: "You must confirm before deleting." }),
  }),
});

type DeleteApplicationPayload = z.infer<typeof deleteApplicationSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: () => Promise<void> | void;
  loading?: boolean;
  applicationName?: string;
}

export default function DeleteApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  applicationName,
}: Props) {
  const {
    handleSubmit,
    register,
    formState: { isSubmitting },
  } = useForm<DeleteApplicationPayload>({
    resolver: zodResolver(deleteApplicationSchema),
    defaultValues: { confirm: true },
  });

  if (!isOpen) return null;

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Application"
      variant="danger"
    >
      <form
        onSubmit={handleSubmit(async () => {
          await onSubmit?.();
        })}
        className="space-y-6"
      >
        <div className="p-6 text-center">
          <p className="text-white text-lg">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-red-400">
              {applicationName ?? "this application"}
            </span>
            ?
          </p>
        </div>

        <ModalFooter
          onCancel={onClose}
          submitLabel="Delete"
          cancelLabel="Cancel"
          loading={isSubmitting || loading}
          variant="danger"
        />
      </form>
    </ModalBase>
  );
}
