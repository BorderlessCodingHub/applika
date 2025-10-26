"use client";
import clsx from "clsx";

interface SkeletonProps {
  className?: string;
  circle?: boolean;
  width?: string | number;
  height?: string | number;
}

export default function Skeleton({
  className,
  circle = false,
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={clsx(
        "bg-white/10 animate-pulse",
        circle ? "rounded-full" : "rounded-md",
        className
      )}
      style={{ width, height }}
    />
  );
}
