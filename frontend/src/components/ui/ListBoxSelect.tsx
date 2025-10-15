"use client";

import { Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";

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
  className?: string; // for custom styling
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
        <div className="relative w-full">
          <Listbox.Button
            className={`w-full h-10 px-4 text-left rounded-lg border border-white/30 bg-white/5 text-white
                        flex justify-between items-center cursor-pointer focus:outline-none ${
                          disabled ? "opacity-50 cursor-not-allowed" : ""
                        }`}
          >
            <span>
              {loading
                ? "Loading..."
                : value
                ? typeof value === "string"
                  ? options.find((o) => o.id.toString() === value)?.name || value
                  : value.name
                : placeholder}
            </span>
            <i className="fa-solid fa-chevron-down text-white/60 text-xs" />
          </Listbox.Button>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-[#1e293b] py-1 text-white shadow-lg z-50">
              {loading ? (
                <div className="px-4 py-2 text-white/70">Loading...</div>
              ) : (
                options.map((option) => (
                  <Listbox.Option
                    key={option.id}
                    value={option}
                    className={({ active }) =>
                      `cursor-pointer select-none px-4 py-2 ${
                        active ? "bg-gray-900/80" : "bg-gray-800/80"
                      } text-white hover:bg-gray-900/80`
                    }
                  >
                    {option.name}
                  </Listbox.Option>
                ))
              )}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}
