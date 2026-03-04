"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type {
  ReportDetailResponse,
  ReportSubmitPayload,
} from "../types/report.types";
import { createReportSubmitSchema } from "../schemas/reportSchema";
import { useReportSubmit } from "../hooks/useReportSubmit";
import {
  ReportFormErrorState,
  ReportFormLoadingState,
  ReportFormSuccessState,
} from "./report-form/states";
import type { ReportFormData } from "./report-form/types";
import { formatSubmittedDate, getLocalDateInputValue } from "./report-form/utils";
import { ReportEditView, ReportSubmittedView } from "./report-form/views";

interface ReportFormProps {
  reportData: ReportDetailResponse | null;
  day: number | null;
  isLoading?: boolean;
  error: Error | null;
  onBack: () => void;
  onSuccess: () => void;
}

export function ReportForm({
  reportData,
  day,
  isLoading,
  error: loadError,
  onBack,
  onSuccess,
}: ReportFormProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const {
    submit,
    isSubmitting,
    isSuccess,
    error: submitError,
  } = useReportSubmit();

  const isDayOne = day === 1;
  const todayLocal = getLocalDateInputValue(new Date());
  const submitSchema = useMemo(
    () => createReportSubmitSchema(isDayOne),
    [isDayOne],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReportFormData>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      start_date: todayLocal,
      mock_interviews_count: 0,
      linkedin_posts_count: 0,
      strategic_connections_count: 0,
      biggest_win: "",
      biggest_challenge: "",
      next_fortnight_goal: "",
    },
  });

  const formValues = watch();

  const handleOpenConfirmModal = () => {
    setShowConfirmModal(true);
  };

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false);
  };

  const handleConfirmSubmit = async () => {
    if (day === null || reportData === null) return;

    const payload: ReportSubmitPayload = {
      start_date: isDayOne ? formValues.start_date : undefined,
      mock_interviews_count: formValues.mock_interviews_count,
      linkedin_posts_count: formValues.linkedin_posts_count,
      strategic_connections_count: formValues.strategic_connections_count,
      biggest_win: formValues.biggest_win,
      biggest_challenge: formValues.biggest_challenge,
      next_fortnight_goal: formValues.next_fortnight_goal,
    };

    try {
      await submit(day, payload);
      handleCloseConfirmModal();
      onSuccess();
    } catch {
      handleCloseConfirmModal();
    }
  };

  if (isLoading) {
    return <ReportFormLoadingState />;
  }

  if (loadError || !reportData) {
    return <ReportFormErrorState error={loadError} onBack={onBack} />;
  }

  if (isSuccess) {
    return <ReportFormSuccessState day={day} onBack={onBack} />;
  }

  if (reportData.report.submitted) {
    return (
      <ReportSubmittedView
        reportData={reportData}
        day={day}
        onBack={onBack}
        formatSubmittedDate={formatSubmittedDate}
      />
    );
  }

  return (
    <ReportEditView
      reportData={reportData}
      day={day}
      onBack={onBack}
      isSubmitting={isSubmitting}
      submitError={submitError}
      isDayOne={isDayOne}
      todayLocal={todayLocal}
      values={formValues}
      errors={errors}
      register={register}
      setValue={setValue}
      handleSubmit={handleSubmit}
      onOpenConfirm={handleOpenConfirmModal}
      showConfirmModal={showConfirmModal}
      onCloseConfirm={handleCloseConfirmModal}
      onConfirmSubmit={handleConfirmSubmit}
    />
  );
}
