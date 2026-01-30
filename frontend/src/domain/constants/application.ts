export const APPLICATION_MODES = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
] as const;

export type ApplicationModeId = typeof APPLICATION_MODES[number]["id"];
export type ApplicationMode = typeof APPLICATION_MODES[number];

export const FILTER_STATUS_OPTIONS = [
  { id: "all", name: "All" },
  { id: "open", name: "Open" },
  { id: "closed", name: "Closed" },
] as const;

export type FilterStatus = (typeof FILTER_STATUS_OPTIONS)[number]["id"];
