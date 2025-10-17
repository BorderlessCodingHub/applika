import { useState } from "react";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import { mutateApplications } from "@/features/applications/hooks/useApplicationModals";
import ModalBase from "@/components/ui/ModalBase";

interface FinalizeApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  feedbacks: { id: string; name: string }[];
  results: { id: string; name: string }[];
  onSubmit: (data: {
    final_step: string;
    feedback_id: string;
    finalize_date: string;
    salary_offer?: string;
    final_observation?: string;
  }) => Promise<void>;
  loadingFeedbacks?: boolean;
  loadingResults?: boolean;
}

export default function FinalizeApplicationModal({
  isOpen,
  onClose,
  feedbacks = [],
  results = [],
  loadingFeedbacks = false,
  loadingResults = false,
  onSubmit,
}: FinalizeApplicationModalProps) {
  const [finalStep, setFinalStep] = useState("");
  const [feedbackId, setFeedbackId] = useState("");
  const [finalizeDate, setFinalizeDate] = useState("");
  const [salaryOffer, setSalaryOffer] = useState("");
  const [observation, setObservation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        final_step: finalStep,
        feedback_id: feedbackId,
        finalize_date: finalizeDate,
        salary_offer: salaryOffer || undefined,
        final_observation: observation,
      };

      await onSubmit(payload);
      await mutateApplications();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <button
      type="submit"
      disabled={isSubmitting}
      className="w-full md:w-auto bg-red-500/80 text-white border border-white/30 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all duration-300 hover:bg-red-500/60"
    >
      {isSubmitting ? "Finalizing..." : "Finalize Application"}
    </button>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Finalize Application"
      footer={footer}
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Result & Feedback Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center relative">
          <div className="relative w-4/5 md:w-3/5">
            <ListBoxSelect
              value={finalStep}
              onChange={setFinalStep}
              options={results}
              placeholder="Select Result"
              loading={loadingResults}
              disabled={loadingResults || results.length === 0}
            />
            {loadingResults && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
          </div>

          <div className="relative w-4/5 md:w-3/5">
            <ListBoxSelect
              value={feedbackId}
              onChange={setFeedbackId}
              options={feedbacks}
              placeholder="Select Feedback"
              loading={loadingFeedbacks}
              disabled={loadingFeedbacks || feedbacks.length === 0}
            />
            {loadingFeedbacks && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                <i className="fa-solid fa-spinner" />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
          <input
            type="date"
            name="finalize_date"
            required
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            className="w-4/5 md:w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
          />
          {finalStep === "6" && (
            <input
              type="number"
              name="salary_offer"
              placeholder="Salary offer amount"
              value={salaryOffer}
              onChange={(e) => setSalaryOffer(e.target.value)}
              className="w-4/5 md:w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
            />
          )}
        </div>

        <div className="flex justify-center">
          <textarea
            name="final_observation"
            rows={3}
            placeholder="Final notes about the application"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            className="w-4/5 h-[150px] px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 resize-none"
          />
        </div>
      </form>
    </ModalBase>
  );
}
