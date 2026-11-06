"use client";
import { useFormatNumber } from "@/i18n/format-number";
import { TooltipProps } from "recharts";
import {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { Card } from "../ui/card";

interface CustomTooltipProps extends TooltipProps<ValueType, NameType> {
  prefix?: string;
  sufix?: string;
}

export function CustomTooltip({
  active,
  payload,
  label,
  labelFormatter,
  prefix,
  sufix,
}: CustomTooltipProps) {
  const formatNumber = useFormatNumber();
  if (active && payload && payload.length) {
    return (
      <Card className="px-4 py-2">
        {payload.map((entry, index) => {
          const heading = labelFormatter
            ? labelFormatter(label, payload)
            : label || entry.name;
          return (
            <div key={`item-${index}`} className="grid">
              <p className="text-base tracking-wide">{`${heading}`}</p>
              <p className="text-center tracking-wide">{`${prefix || ""}${typeof entry.value === "number" ? formatNumber(entry.value) : entry.value}${sufix || ""}`}</p>
            </div>
          );
        })}
      </Card>
    );
  }
  return null;
}
