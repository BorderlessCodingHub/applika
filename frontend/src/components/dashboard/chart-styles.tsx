"use client";
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
  prefix,
  sufix
}: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <Card className="px-4 py-2">
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="grid">
            <p className="text-base tracking-wide">{`${label || entry.name}`}</p>
            <p className="text-center tracking-wide">{`${prefix || ''}${entry.value}${sufix || ''}`}</p>
          </div>
        ))}
      </Card>
    );
  }
  return null;
}
