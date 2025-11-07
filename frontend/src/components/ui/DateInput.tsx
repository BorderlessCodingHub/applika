import React from "react";
import { cn } from "@/lib/utils"; // optional if you use a class merging helper

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function DateInput({ label, error, className, ...props }: DateInputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm text-white/70 mb-1">
          {label}
        </label>
      )}
      <input
        {...props}
        type="date"
        className={cn(
          "w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white",
          "placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all",
          error ? "border-red-400" : "",
          className
        )}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
