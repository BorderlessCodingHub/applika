"use client";

import React from "react";

type PlatformData = {
  platform_name: string;
  count: number;
};

type ApplicationsByPlatformCardProps = {
  applicationsByPlatform: PlatformData[];
  totalApplications: number;
};

export default function ApplicationsByPlatformCardClient({
  applicationsByPlatform,
  totalApplications,
}: ApplicationsByPlatformCardProps) {
  return (
    <div
      className="
        dashboard-card-size
        backdrop-blur-[20px]
        bg-white/5
        border border-white/20
        rounded-2xl
        p-8
        my-4
        shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        min-h-[300px]
      "
    >
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-[1.1rem] m-0">
          <i className="fa-solid fa-globe"></i>
          Applications by Platform
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {applicationsByPlatform.map((platform) => {
          const percentage = ((platform.count / totalApplications) * 100).toFixed(1);

          return (
            <div
              key={platform.platform_name}
              className="flex justify-between items-center py-2 border-b border-white/10"
            >
              <span className="text-white/80 font-medium">{platform.platform_name}</span>

              <div className="flex items-center gap-3">
                <span className="text-white/90 font-bold min-w-[30px] text-right">
                  {platform.count}
                </span>
                <div className="w-16 h-1.5 bg-white/10 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#13ecab]/80 to-[#13ecab] rounded transition-all duration-500 ease-in-out"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
