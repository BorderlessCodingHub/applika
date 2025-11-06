"use client";

import { Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface Option {
  id: string | number;
  name: string;
}

interface ListBoxSelectProps {
  value: Option | null | string;
  onChange: (val: any) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export default function ListBoxSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  loading = false,
  className = "",
}: ListBoxSelectProps) {
  return (
    <div className={className}>
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        {({ open }) => (
          <div className="relative w-full">
            {/* BUTTON */}
            <Listbox.Button
              className={`w-full h-10 px-4 text-left rounded-lg border border-white/30 bg-white/5 text-white
                          flex justify-between items-center cursor-pointer focus:outline-none transition-colors duration-150
                          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-white/50"}`}
            >
              <span className="truncate">
                {loading
                  ? "Loading..."
                  : value
                  ? typeof value === "string"
                    ? options.find((o) => o.id.toString() === value)?.name || value
                    : value.name
                  : placeholder}
              </span>

              {/* Animated Chevron */}
              <motion.div
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="flex items-center justify-center"
              >
                <ChevronDown className="w-4 h-4 text-white/60" />
              </motion.div>
            </Listbox.Button>

            {/* OPTIONS */}
            <Transition
              as={Fragment}
              enter="transition ease-out duration-150"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-[#1e293b]/95 backdrop-blur-sm py-1 text-white shadow-xl z-50 border border-white/10">
                {loading ? (
                  <div className="px-4 py-2 text-white/70">Loading...</div>
                ) : (
                  options.map((option) => (
                    <Listbox.Option
                      key={option.id}
                      value={option}
                      className={({ active }) =>
                        `cursor-pointer select-none px-4 py-2 text-sm ${
                          active ? "bg-gray-900/80" : "bg-gray-800/80"
                        } hover:bg-gray-900/80`
                      }
                    >
                      {option.name}
                    </Listbox.Option>
                  ))
                )}
              </Listbox.Options>
            </Transition>
          </div>
        )}
      </Listbox>
    </div>
  );
}
