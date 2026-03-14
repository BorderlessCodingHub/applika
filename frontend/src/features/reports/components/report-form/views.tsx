import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Calendar, CheckCircle } from "lucide-react";
import Alert from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import ModalBase from "@/components/ui/ModalBase";
import type { ReportDetailResponse } from "../../types/report.types";
import {
  AutoCalculatedMetricsSection,
  GoalSection,
  ManualMetricsSection,
  ReflectionSection,
  TotalsSection,
} from "./sections";
import type {
  ReportFormData,
  ReportFormErrors,
  ReportFormHandleSubmit,
  ReportFormRegister,
  ReportFormSetValue,
} from "./types";

interface ReportSubmittedViewProps {
  reportData: ReportDetailResponse;
  day: number | null;
  onBack: () => void;
  formatSubmittedDate: (dateString: string | null) => string;
}

interface ReportEditViewProps {
  reportData: ReportDetailResponse;
  day: number | null;
  onBack: () => void;
  isSubmitting: boolean;
  submitError: Error | null;
  isDayOne: boolean;
  todayLocal: string;
  values: ReportFormData;
  errors: ReportFormErrors;
  register: ReportFormRegister;
  setValue: ReportFormSetValue;
  handleSubmit: ReportFormHandleSubmit;
  onOpenConfirm: () => void;
  showConfirmModal: boolean;
  onCloseConfirm: () => void;
  onConfirmSubmit: () => Promise<void>;
}

function ReportHeader({
  day,
  phase,
  onBack,
}: {
  day: number | null;
  phase: number;
  onBack: () => void;
}) {
  return (
    <>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white hover:cursor-pointer transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        Back to Reports
      </button>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Report - Day {day} of 120
          </h1>
          <p className="text-emerald-400 font-medium">Phase {phase}</p>
        </div>
      </div>
    </>
  );
}

export function ReportSubmittedView({
  reportData,
  day,
  onBack,
  formatSubmittedDate,
}: ReportSubmittedViewProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <ReportHeader day={day} phase={reportData.report.phase} onBack={onBack} />

        <div className="mt-4 flex items-center gap-2 px-4 py-2 w-fit bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <CheckCircle size={18} className="text-emerald-500" />
          <span className="text-emerald-400 text-sm font-medium">Report Submitted</span>
        </div>

        {reportData.report.submitted_at && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 flex items-center gap-2 text-gray-400 text-sm"
          >
            <Calendar size={14} />
            <span>Submitted on {formatSubmittedDate(reportData.report.submitted_at)}</span>
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-8"
      >
        <AutoCalculatedMetricsSection metrics={reportData.metrics} readOnly />
        <ManualMetricsSection mode="readonly" manualMetrics={reportData.manual_metrics} />
        <ReflectionSection mode="readonly" manualMetrics={reportData.manual_metrics} />
        <TotalsSection metrics={reportData.metrics} readOnly />
        <GoalSection mode="readonly" manualMetrics={reportData.manual_metrics} />

        <div className="flex justify-center pt-4">
          <Button
            onClick={onBack}
            variant="primary"
            className="flex items-center gap-2 hover:cursor-pointer"
          >
            <ArrowLeft size={16} />
            Back to Reports
          </Button>
        </div>
      </motion.div>
    </>
  );
}

export function ReportEditView({
  reportData,
  day,
  onBack,
  isSubmitting,
  submitError,
  isDayOne,
  todayLocal,
  values,
  errors,
  register,
  setValue,
  handleSubmit,
  onOpenConfirm,
  showConfirmModal,
  onCloseConfirm,
  onConfirmSubmit,
}: ReportEditViewProps) {
  return (
    <>
      {submitError && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Alert
            type="error"
            message={submitError.message || "Failed to submit report. Please try again."}
          />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <ReportHeader day={day} phase={reportData.report.phase} onBack={onBack} />

        {!reportData.can_submit && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg w-fit">
            <AlertCircle size={18} className="text-yellow-500" />
            <span className="text-yellow-400 text-sm">
              {reportData.report.submitted
                ? "Report already submitted"
                : "Cannot submit yet"}
            </span>
          </div>
        )}
      </motion.div>

      <form onSubmit={handleSubmit(onOpenConfirm)} className="space-y-8">
        <AutoCalculatedMetricsSection metrics={reportData.metrics} />
        <ManualMetricsSection
          mode="edit"
          isDayOne={isDayOne}
          todayLocal={todayLocal}
          values={values}
          errors={errors}
          register={register}
          setValue={setValue}
        />
        <ReflectionSection mode="edit" values={values} errors={errors} setValue={setValue} />
        <TotalsSection metrics={reportData.metrics} />
        <GoalSection mode="edit" values={values} errors={errors} setValue={setValue} />

        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="sm:w-auto w-full"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!reportData.can_submit || isSubmitting}
            className="sm:w-auto w-full flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>Submit Report</>
            )}
          </Button>
        </div>
      </form>

      <ModalBase isOpen={showConfirmModal} title="Confirm Submission" onClose={onCloseConfirm}>
        <div className="space-y-4">
          <p className="text-gray-300">
            Are you sure you want to submit your Day {day} report? This action cannot be
            undone.
          </p>

          <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Mock Interviews:</span>
              <span className="text-white">{values.mock_interviews_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">LinkedIn Posts:</span>
              <span className="text-white">{values.linkedin_posts_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Connections:</span>
              <span className="text-white">{values.strategic_connections_count}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="ghost" onClick={onCloseConfirm} className="sm:flex-1 hover:cursor-pointer">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onConfirmSubmit}
              disabled={isSubmitting}
              className="sm:flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>Confirm Submit</>
              )}
            </Button>
          </div>
        </div>
      </ModalBase>
    </>
  );
}
