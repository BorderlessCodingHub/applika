import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAgendaUrgencyColor(diffHours: number) {
  console.log("diffHours", diffHours);
  if (diffHours < 0) return "#9CA3AF"; // past
  if (diffHours <= 3) return "#EF4444"; // red
  if (diffHours <= 6) return "#F97316"; // orange
  if (diffHours <= 12) return "#EAB308"; // yellow
  if (diffHours <= 24) return "#3B82F6"; // blue
  return "#9CA3AF"; // >24h gray
}
