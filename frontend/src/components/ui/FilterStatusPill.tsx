"use client";

import { Fragment, useEffect, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { motion } from "framer-motion";
import { ChevronDown, Funnel } from "lucide-react";
import { FILTER_STATUS_OPTIONS } from "@/domain/constants/application";
import type { FilterStatus } from "@/domain/constants/application";

interface Props {
  value: FilterStatus;
  onChange: (v: FilterStatus) => void;
}

export default function FilterStatusPill({ value, onChange }: Props) {
  const active = value !== "all";
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);

  return (
    <div className="w-full sm:inline-block">
      <Listbox value={value} onChange={(opt: any) => onChange(opt.id)}>
        {({ open }) => (
          <div className="relative inline-block w-full sm:w-auto">
            <Listbox.Button
              title="Filter by status"
              aria-label="Filter by status"
              className={`w-full sm:w-auto flex items-center justify-between gap-2 min-h-[44px] px-4 rounded-full transition-colors duration-150 focus:outline-none ${
                active
                  ? "bg-emerald-400 text-black border-emerald-600"
                  : "bg-white/6 text-white border border-white/10"
              } shadow-sm hover:shadow-md`}
            >
              <div className="flex items-center gap-2 truncate">
                <Funnel className={`w-4 h-4 ${active ? "text-black" : "text-white/60"}`} />
                <span className="truncate">{FILTER_STATUS_OPTIONS.find((o) => o.id === value)?.name ?? "Status"}</span>
              </div>

              <div className="flex items-center gap-2">
                {active && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-black/80 text-white font-semibold">1</span>
                )}
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className={`${active ? "text-black" : "text-white/60"} w-4 h-4`} />
                </motion.span>
              </div>
            </Listbox.Button>

            {/* Desktop dropdown vs mobile bottom-sheet */}
            {isMobile ? (
              <Transition
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                {/* position absolutely under the button on small screens to avoid covering it */}
                <div className="absolute left-0 w-full z-[9999]" style={{ top: 'calc(100% + 8px)' }}>
                  <Listbox.Options className="max-h-[60vh] overflow-auto rounded-lg bg-[#0f1724]/95 backdrop-blur-sm py-2 text-white shadow-xl border border-white/10">
                    {FILTER_STATUS_OPTIONS.map((option) => (
                      <Listbox.Option
                        key={option.id}
                        value={option}
                        className={({ active }) =>
                          `cursor-pointer select-none px-4 py-3 text-sm ${active ? "bg-gray-900/80" : "bg-gray-800/80"}`
                        }
                      >
                        {option.name}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Transition>
            ) : (
              <Transition
                as="div"
                enter="transition ease-in-out duration-100"
                enterFrom="opacity-0 scale-98"
                enterTo="opacity-100 scale-100"
                leave="transition ease-in-out duration-75"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-98"
              >
                {/* options anchored under the button; absolute so they don't push layout */}
                <div>
                  <Listbox.Options
                    className="absolute left-0 w-full sm:min-w-[200px] sm:max-w-screen-sm max-h-[60vh] overflow-auto rounded-md bg-[#0f1724]/95 backdrop-blur-sm py-1 text-white shadow-xl z-[9999] border border-white/10"
                    style={{ willChange: "transform, opacity", top: "calc(100% + 8px)" }}
                  >
                    {FILTER_STATUS_OPTIONS.map((option) => (
                      <Listbox.Option
                        key={option.id}
                        value={option}
                        className={({ active }) =>
                          `cursor-pointer select-none px-4 py-2 text-sm ${active ? "bg-gray-900/80" : "bg-gray-800/80"}`
                        }
                      >
                        {option.name}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Transition>
            )}
          </div>
        )}
      </Listbox>
    </div>
  );
}
