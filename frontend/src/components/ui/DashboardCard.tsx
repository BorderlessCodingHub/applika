import React from "react";

type DashboardCardProps = {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
};

export default function DashboardCard({
  children,
  className = "",
  fullWidth = false,
}: DashboardCardProps) {
  const spanClass = fullWidth ? "col-span-1 lg:col-span-2" : "";
  return <div className={`${spanClass} ${className}`}>{children}</div>;
}
