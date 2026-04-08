"use client";

import { FILTER_STATUS_OPTIONS } from "@/domain/constants/application";
import type { FilterStatus } from "@/domain/constants/application";

interface Props {
  value: FilterStatus;
  onChange: (v: FilterStatus) => void;
}

export default function FilterStatusSegmented({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-white/4 p-1">
      {FILTER_STATUS_OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${active ? "bg-emerald-400/90 text-black" : "text-white/80 hover:bg-white/6"}`}
          >
            {opt.name}
          </button>
        );
      })}
    </div>
  );
}
