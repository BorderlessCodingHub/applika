"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";

import {
  createApplicationSchema,
  type CreateApplicationPayload,
} from "../schemas/applications/createApplicationSchema";
import { createApplication } from "../services/applicationsService";
import { mutateApplications } from "../hooks/useApplications";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: string; name: string }[];
  loading?: boolean;
  onSubmit?: (payload: CreateApplicationPayload) => Promise<void> | void;
}

const MODES = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
];

export default function AddApplicationModal({
  isOpen,
  onClose,
  platforms,
  onSubmit,
  loading = false,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateApplicationPayload>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: useMemo(
      () => ({
        company: "",
        role: "",
        application_date: "",
        platform_id: "",
        mode: "",
        expected_salary: undefined,
        salary_range_min: undefined,
        salary_range_max: undefined,
        observation: "",
      }),
      []
    ),
  });

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const onFormSubmit = async (data: CreateApplicationPayload) => {
    // delegate to parent
    await onSubmit?.({ ...data, platform_id: Number(data.platform_id) });
  };

  if (!isOpen) return null;

  return (
    <ModalBase isOpen={isOpen} title="Add New Application" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit(onFormSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("company")}
            type="text"
            placeholder="Company (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            {...register("role")}
            type="text"
            placeholder="Role (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <input
            {...register("application_date")}
            type="date"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />

          <Controller
            control={control}
            name="platform_id"
            render={({ field }) => (
              <ListBoxSelect
                value={platforms.find((p) => p.id === field.value) ?? null}
                onChange={(v) => field.onChange(v?.id ?? "")}
                options={platforms}
                placeholder={
                  platforms.length === 0
                    ? "Loading platforms..."
                    : "Select Platform (required)"
                }
                loading={platforms.length === 0}
                disabled={platforms.length === 0}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <ListBoxSelect
                value={MODES.find((m) => m.id === field.value) ?? null}
                onChange={(val) => field.onChange(val?.id ?? "")}
                options={MODES}
                placeholder="Select Mode (required)"
              />
            )}
          />
          <input
            {...register("expected_salary")}
            type="number"
            placeholder="Expected Salary (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("salary_range_min")}
            type="number"
            placeholder="Salary Range Min (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            {...register("salary_range_max")}
            type="number"
            placeholder="Salary Range Max (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <textarea
          {...register("observation")}
          rows={3}
          placeholder="Observation (optional)"
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white 
                     placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
        />

        <ModalFooter
          onCancel={onClose}
          submitLabel="Create Application"
          loading={isSubmitting || loading}
          disabled={isSubmitting || loading || platforms.length === 0}
        />
      </form>
    </ModalBase>
  );
}
