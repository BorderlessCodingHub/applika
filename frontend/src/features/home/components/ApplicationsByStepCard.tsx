type StepData = {
  step_name: string;
  count: number;
  conversion_rate: number;
  step_color: string;
};

type ApplicationsByStepCardProps = {
  conversionData: StepData[];
};

export default function ApplicationsByStepCard({
  conversionData,
}: ApplicationsByStepCardProps) {
  return (
    <div
      className="
        dashboard-card-size
        backdrop-blur-[20px]
        bg-white/5
        border border-white/20
        rounded-2xl
        p-6
        min-h-[300px]
      "
    >
      {/* Card Header */}
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-lg">
          <i className="fa-solid fa-layer-group"></i>
          Applications by Step
        </h3>
      </div>

      {/* Step Metrics */}
      <div className="flex flex-col gap-4">
        {conversionData.map((step) => (
          <div
            key={step.step_name}
            className="
                flex justify-between items-center
                p-3
                bg-white/5
                rounded-lg
                transition-all duration-300 ease-in-out
                hover:bg-white/10
              "
          >
            {/* Step Info */}
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: step.step_color }}
              ></div>
              <div className="flex flex-col">
                <span className="font-semibold text-white/90 text-sm">
                  {step.step_name}
                </span>
                <span className="text-xs text-white/60">
                  {step.count} applications
                </span>
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="text-right">
              <span className="text-white/90 font-bold text-base">
                {step.conversion_rate}%
              </span>
              <span className="block text-xs text-white/60">reach rate</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
