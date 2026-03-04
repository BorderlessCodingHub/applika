import { useEffect, useState, type ElementType } from "react";
import { motion } from "framer-motion";

interface BaseStatCardProps {
  icon: ElementType;
  label: string;
  value: number;
  suffix?: string;
  isPercentage?: boolean;
}

interface TextareaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  placeholder: string;
  icon: ElementType;
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  icon: ElementType;
}

interface ReadOnlyTextFieldProps {
  label: string;
  value: string;
  icon: ElementType;
}

interface ReadOnlyNumberFieldProps {
  label: string;
  value: number;
  icon: ElementType;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  isPercentage = false,
}: BaseStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/50 rounded-lg border border-white/10 p-4"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <Icon size={18} className="text-emerald-400" />
        </div>
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">
        {isPercentage ? value.toFixed(1) : value}
        {suffix}
      </p>
    </motion.div>
  );
}

export function ReadOnlyStatCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  isPercentage = false,
}: BaseStatCardProps) {
  return (
    <div className="bg-gray-800/30 rounded-lg border border-white/5 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <Icon size={18} className="text-emerald-400/70" />
        </div>
        <span className="text-gray-500 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-300">
        {isPercentage ? value.toFixed(1) : value}
        {suffix}
      </p>
    </div>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  maxLength,
  error,
  placeholder,
  icon: Icon,
}: TextareaFieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <Icon size={16} className="text-emerald-400" />
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={3}
        className={`w-full px-4 py-3 rounded-lg bg-gray-800/50 border text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${
          error ? "border-red-500/50" : "border-white/10"
        }`}
      />
      <div className="flex justify-between text-xs">
        <span className={error ? "text-red-400" : "text-gray-500"}>
          {error || `${value.length}/${maxLength} characters`}
        </span>
      </div>
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  error,
  icon: Icon,
}: NumberInputProps) {
  const [inputValue, setInputValue] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setInputValue(value === 0 ? "" : String(value));
  }, [value]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <Icon size={16} className="text-emerald-400" />
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={inputValue}
        onChange={(e) => {
          const newValue = e.target.value;
          if (newValue === "" || /^\d+$/.test(newValue)) {
            setInputValue(newValue);
            const numericValue =
              newValue === "" ? 0 : Number.parseInt(newValue, 10);
            onChange(numericValue);
          }
        }}
        onBlur={() => {
          const numericValue =
            inputValue === "" ? 0 : Number.parseInt(inputValue, 10);
          setInputValue(numericValue === 0 ? "" : String(numericValue));
          onChange(numericValue);
        }}
        className={`w-full px-4 py-3 rounded-lg bg-gray-800/50 border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${
          error ? "border-red-500/50" : "border-white/10"
        }`}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function ReadOnlyTextField({
  label,
  value,
  icon: Icon,
}: ReadOnlyTextFieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-400">
        <Icon size={16} className="text-emerald-400/70" />
        {label}
      </label>
      <div className="w-full px-4 py-3 rounded-lg bg-gray-800/30 border border-white/5 text-gray-300 min-h-[80px]">
        {value || <span className="text-gray-600 italic">Not provided</span>}
      </div>
    </div>
  );
}

export function ReadOnlyNumberField({
  label,
  value,
  icon: Icon,
}: ReadOnlyNumberFieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-400">
        <Icon size={16} className="text-emerald-400/70" />
        {label}
      </label>
      <div className="w-full px-4 py-3 rounded-lg bg-gray-800/30 border border-white/5 text-gray-300 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}
