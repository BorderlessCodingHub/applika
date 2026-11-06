import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function FlagBr({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-1960 -1470 3920 2940"
      aria-hidden="true"
      className={cn("h-3 w-4", className)}
      {...props}
    >
      <path fill="#009B3A" d="M-1960-1470h3920v2940h-3920z" />
      <path fill="#FEDF00" d="M-1743 0 0-1113 1743 0 0 1113z" />
      <circle r="735" fill="#002776" />
      <path
        fill="#FFFFFF"
        d="M-672.29-297.08A1785 1785 0 0 1 727.76 102.93A735 735 0 0 1 701.55 219.19A1680 1680 0 0 0-711.46-184.52A735 735 0 0 1-672.29-297.08z"
      />
    </svg>
  );
}
