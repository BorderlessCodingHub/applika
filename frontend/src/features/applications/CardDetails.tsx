// src/features/applications/components/CardDetails.tsx
"use client";
import { useMemo } from "react";
import CardDetailsSkeleton from "@/components/ui/CardDetailsSkeleton";
import { useApplicationSteps } from "@/features/applications/hooks/useApplicationSteps";

interface CardDetailsProps {
  id: number;
  isOpen: boolean;
  observation?: string;
  onEditStep: (step: any) => void;
  onDeleteStep: (step: any) => void;
}

export default function CardDetails({
  id,
  isOpen,
  observation,
  onEditStep,
  onDeleteStep,
}: CardDetailsProps) {
  // Only fetch steps when modal is open
  const appId = useMemo(() => (isOpen ? id : undefined), [isOpen, id]);
  const { steps, isLoading, isValidating } = useApplicationSteps(appId);

  const loading = isLoading || isValidating;

  if (!isOpen) return null;

  return (
    <div className="mt-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl transition-all">
      {loading ? (
        <CardDetailsSkeleton />
      ) : steps.length > 0 ? (
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id ?? index} className="flex gap-4 items-start">
              <div className="relative w-3 h-3 bg-white/20 rounded-full mt-1.5" />
              <div className="flex-1">
                <div className="font-medium">{step.step_name}</div>
                <div className="text-sm text-white/60">{step.step_date}</div>
                {step.observation && (
                  <div className="mt-1 text-white/80 text-sm bg-white/5 rounded-lg p-2">
                    {step.observation}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="text-xs text-blue-400"
                  onClick={() => onEditStep(step)}
                >
                  Edit
                </button>
                <button
                  className="text-xs text-red-400"
                  onClick={() => onDeleteStep(step)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-white/60 italic text-sm">
          No steps found for this application.
        </div>
      )}

      {observation && !loading && (
        <div className="mt-4 bg-white/5 rounded-xl p-3 text-white/80 text-sm">
          <strong>Observation:</strong> {observation}
        </div>
      )}
    </div>
  );
}
