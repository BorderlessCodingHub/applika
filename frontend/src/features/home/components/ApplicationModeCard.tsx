import React from 'react';

type ModeData = {
  mode: string;
  count: number;
};

type ApplicationModeCardProps = {
  applicationsByMode: ModeData[];
  totalApplications: number;
};

export default function ApplicationModeCard({
  applicationsByMode,
  totalApplications
}: ApplicationModeCardProps) {
  return (
    <div className="
      dashboard-card-size
      backdrop-blur-[20px]
      bg-white/5
      border border-white/20
      rounded-2xl
      p-8
      my-4
      shadow-[0_8px_32px_rgba(0,0,0,0.1)]
      min-h-[300px]
    ">
      {/* Card Header */}
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-[1.1rem] m-0">
          <i className="fa-solid fa-pie-chart"></i>
          Application Mode
        </h3>
      </div>

      {/* Mode Metrics */}
      <div className="flex flex-col gap-4">
        {applicationsByMode.map((mode) => {
          const percentage = ((mode.count / totalApplications) * 100).toFixed(1);
          return (
            <div
              key={mode.mode}
              className="
                flex justify-between items-center
                p-3
                bg-white/5
                rounded-lg
              "
            >
              <div className="flex flex-col">
                <span className="font-semibold text-white/90 text-[0.95rem] capitalize">{mode.mode}</span>
                <span className="text-white/60 text-[0.8rem]">{mode.count} applications</span>
              </div>
              <div className="text-white/90 font-bold text-[1.1rem]">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
