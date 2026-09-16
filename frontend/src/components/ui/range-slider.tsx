"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * applika-only component (KODI-002 / T032): a Radix slider that renders one
 * thumb per value, used by the dashboard's application-trend range control.
 * Restyled by hand to the new-york idiom — function component, `data-slot`
 * hooks, the unified `radix-ui` import — with the thumb-count behaviour and
 * the exported API unchanged.
 */
function RangeSlider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbCount = Array.isArray(props.value)
    ? props.value.length
    : Array.isArray(props.defaultValue)
      ? props.defaultValue.length
      : 2;

  return (
    <SliderPrimitive.Root
      data-slot="range-slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="range-slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary"
      >
        <SliderPrimitive.Range
          data-slot="range-slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          data-slot="range-slider-thumb"
          key={i}
          className="block size-4 shrink-0 rounded-full border-2 border-primary bg-background ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { RangeSlider };
