import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const STAR = "l8.69 26.74-22.75-16.53h28.12l-22.75 16.53z";

const round = (value: number) => Math.round(value * 100) / 100;

const STARS = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, column) => {
    const x = 30.24 * (2 * column + 1 + (row % 2));
    const y = 25.92 * (row + 1) - 14.78;
    return `M${round(x)} ${round(y)}${STAR}`;
  }).join(""),
).join("");

export function FlagUs({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      aria-hidden="true"
      className={cn("h-3 w-4", className)}
      {...props}
    >
      <path fill="#B22234" d="M0 0h640v480H0z" />
      <path
        fill="#FFFFFF"
        d="M0 36.92H640V73.85H0zM0 110.77H640V147.69H0zM0 184.62H640V221.54H0zM0 258.46H640V295.38H0zM0 332.31H640V369.23H0zM0 406.15H640V443.08H0z"
      />
      <path fill="#3C3B6E" d="M0 0h364.8v258.46H0z" />
      <path fill="#FFFFFF" d={STARS} />
    </svg>
  );
}
