"use client";
import { TooltipProps } from "recharts";
import {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { Card } from "../ui/card";

export function CustomTooltip({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    return (
      <Card className="px-4 py-2">
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="grid">
            <p className="text-base">{`${label || entry.name}`}</p>
            <p className="text-center">{entry.value}</p>
          </div>
        ))}
      </Card>
    );
  }
  return null;
}
