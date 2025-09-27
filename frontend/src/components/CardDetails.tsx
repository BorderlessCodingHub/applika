import { FC } from 'react';

interface Step {
  id: string;
  step_id: string;
  step_name: string;
  step_date: string;
  observation?: string;
  step_color: string;
}

interface CardDetailsProps {
  isOpen: boolean;        // <── NEW: controlled by parent
  id: string;
  expected_salary: number;
  salary_offer?: number;
  mode: string;
  last_step_date: string;
  feedback_date: string;
  observation?: string;
  steps?: Step[];
}

const CardDetails: FC<CardDetailsProps> = ({
  isOpen,
  id,
  expected_salary,
  salary_offer,
  mode,
  last_step_date,
  feedback_date,
  observation,
  steps = [],
}) => {
  return (
    <div
      id={`details-${id}`}
      className={`transition-all duration-300 overflow-hidden ${
        isOpen ? 'max-h-[5000px] mt-3 pt-3 border-t border-white/10' : 'max-h-0'
      }`}
    >
      {/* Detailed Information Grid */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <span className="text-white/90 truncate">
          <strong>Salary Expected:</strong> ${expected_salary}k
        </span>

        <span className="text-white/90 truncate">
          <strong>Salary Offer:</strong> {salary_offer ? `$${salary_offer}k` : 'N/A'}
        </span>

        <span className="text-white/90 truncate">
          <strong>Mode:</strong> {mode}
        </span>

        <span className="text-white/90 truncate">
          <strong>Step Update:</strong> {last_step_date}
        </span>

        <span className="text-white/90 truncate">
          <strong>Feedback Date:</strong> {feedback_date}
        </span>
      </div>

      {observation && (
        <div className="text-xs text-white/80 italic mt-3 p-2 bg-white/5 rounded-md border-l-4 border-white/20">
          <strong>Note:</strong> {observation}
        </div>
      )}

      {/* Timeline */}
      <div className="mt-4">
        <h4 className="flex items-center gap-2 mb-4 text-sm font-semibold text-white/90">
          <i className="fa-solid fa-clock text-white/70" />
          Application Timeline
        </h4>

        {steps.length > 0 ? (
          <div className="relative py-4 my-4">
            <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-gradient-to-b from-white/30 to-white/10" />
            {steps.map((step) => (
              <div key={step.id} className="relative flex items-start mb-4 pl-8 last:mb-0">
                <div
                  className="absolute left-0 top-2 w-4 h-4 rounded-full border-4 shadow-md"
                  style={{
                    borderColor: step.step_color,
                    backgroundColor: `${step.step_color}33`,
                  }}
                />
                <div className="flex-1 bg-white/10 hover:bg-white/15 p-2 rounded-xl border-l-4 border-white/20 backdrop-blur transition-all duration-300 hover:translate-x-1">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="font-semibold text-white/95 text-sm">{step.step_name}</span>
                    <div className="text-sm flex items-center gap-2">
                      <span className="text-white/70 bg-white/10 px-3 py-0.5 rounded-full">
                        {step.step_date}
                      </span>
                      <i className="fa-solid fa-pen-to-square cursor-pointer pl-2" title="Edit Step" />
                      <i className="fa-solid fa-trash cursor-pointer pl-2" title="Delete Step" />
                    </div>
                  </div>
                  {step.observation && (
                    <div className="text-sm text-white/80 mt-2 p-3 bg-white/5 rounded-md border-l-2 border-white/30">
                      {step.observation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 p-8 text-white/60 italic">
            <i className="fa-solid fa-info-circle text-lg opacity-70" />
            <span>No steps recorded yet</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardDetails;
