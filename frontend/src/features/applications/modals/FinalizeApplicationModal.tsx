"use client";

import { Fragment, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { mutateApplications } from "@/features/applications/hooks/useApplicationModals";

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
  applicationId,
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

  return (
    <div
      className={`fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center transition-opacity ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible"
      }`}
    >
      <div className="relative w-[90%] max-w-[1200px] bg-white/5 backdrop-blur-[20px] border border-white/20 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] animate-[modalSlideIn_0.3s_ease-out]">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
          <h3 className="text-white m-0">Finalize Application</h3>
          <span
            className="text-white/70 text-2xl font-bold cursor-pointer hover:text-white transition-all"
            onClick={onClose}
          >
            &times;
          </span>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Result & Feedback Row */}
          <div className="grid grid-cols-2 gap-4 justify-items-center">
            {/* Result Selector */}
            <div className="flex flex-col w-full items-center relative">
              <Listbox
                value={finalStep}
                onChange={setFinalStep}
                disabled={loadingResults}
              >
                <div className="relative w-3/5">
                  <Listbox.Button
                    className={`w-full h-10 px-4 text-left rounded-lg border border-white/30 bg-white/5 text-white ${
                      loadingResults ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {loadingResults
                      ? "Loading results..."
                      : results.find((r) => r.id === finalStep)?.name ||
                        "Select Result"}
                  </Listbox.Button>

                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white/5 py-1 text-white shadow-lg ring-1 ring-black/20 focus:outline-none z-10">
                      {loadingResults ? (
                        <div className="px-4 py-2 text-white/70">
                          Loading...
                        </div>
                      ) : (
                        results.map((r) => (
                          <Listbox.Option
                            key={r.id}
                            value={r.id}
                            className={({ active }: { active: boolean }) =>
                              `cursor-pointer select-none px-4 py-2 ${
                                active ? "bg-gray-900/80" : "bg-gray-800/90"
                              } text-white hover:bg-gray-900/80`
                            }
                          >
                            {r.name}
                          </Listbox.Option>
                        ))
                      )}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>

              {loadingResults && (
                <div className="absolute right-[25%] top-2.5 animate-spin text-white/50">
                  <i className="fa-solid fa-spinner" />
                </div>
              )}
            </div>

            {/* Feedback Selector */}
            <div className="flex flex-col w-full items-center relative">
              <Listbox
                value={feedbackId}
                onChange={setFeedbackId}
                disabled={loadingFeedbacks}
              >
                <div className="relative w-3/5">
                  <Listbox.Button
                    className={`w-full h-10 px-4 text-left rounded-lg border border-white/30 bg-white/5 text-white ${
                      loadingFeedbacks ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {loadingFeedbacks
                      ? "Loading feedbacks..."
                      : feedbacks.find((f) => f.id === feedbackId)?.name ||
                        "Select Feedback"}
                  </Listbox.Button>

                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white/5 py-1 text-white shadow-lg ring-1 ring-black/20 focus:outline-none z-10">
                      {loadingFeedbacks ? (
                        <div className="px-4 py-2 text-white/70">
                          Loading...
                        </div>
                      ) : (
                        feedbacks.map((f) => (
                          <Listbox.Option
                            key={f.id}
                            value={f.id}
                            className={({ active }: { active: boolean }) =>
                              `cursor-pointer select-none px-4 py-2 ${
                                active ? "bg-gray-900/80" : "bg-gray-800/90"
                              } text-white hover:bg-gray-900/80`
                            }
                          >
                            {f.name}
                          </Listbox.Option>
                        ))
                      )}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>

              {loadingFeedbacks && (
                <div className="absolute right-[25%] top-2.5 animate-spin text-white/50">
                  <i className="fa-solid fa-spinner" />
                </div>
              )}
            </div>
          </div>

          {/* Date & Salary Row */}
          <div className="grid grid-cols-2 gap-4 justify-items-center">
            <input
              type="date"
              name="finalize_date"
              required
              value={finalizeDate}
              onChange={(e) => setFinalizeDate(e.target.value)}
              className="w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
            />
            {finalStep === "6" && (
              <input
                type="number"
                name="salary_offer"
                placeholder="Salary offer amount"
                value={salaryOffer}
                onChange={(e) => setSalaryOffer(e.target.value)}
                className="w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
              />
            )}
          </div>

          {/* Final Observation */}
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

          {/* Footer */}
          <div className="flex justify-end gap-4 border-t border-white/20 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-500/80 text-white border border-white/30 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all duration-300 hover:bg-red-500/60"
            >
              {isSubmitting ? "Finalizing..." : "Finalize Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
