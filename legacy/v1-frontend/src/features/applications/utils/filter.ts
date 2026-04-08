import type { Application } from "../types";
import { FilterStatus } from "@/domain/constants/application";

export const normalizeString = (str: string | undefined | null): string =>
  (str || "").trim().toLowerCase();

const filterStrategies: Record<
  FilterStatus,
  (apps: Application[]) => Application[]
> = {
  all: (apps) => apps,
  open: (apps) => apps.filter(({ finalized }) => !finalized),
  closed: (apps) => apps.filter(({ finalized }) => finalized),
};

export const filterByStatus = (
  status: FilterStatus,
  applications: Application[],
): Application[] => {
  const strategy = filterStrategies[status] ?? filterStrategies.all;
  return strategy(applications);
};

export const matchesSearchTerm = (
  app: Application,
  normalizedTerm: string,
): boolean => {
  if (!normalizedTerm) {
    return true;
  }

  const company = normalizeString(app.company);
  const role = normalizeString(app.role);

  return company.includes(normalizedTerm) || role.includes(normalizedTerm);
};
