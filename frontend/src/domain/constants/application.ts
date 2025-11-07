export const APPLICATION_MODES = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
] as const;

export type ApplicationModeId = typeof APPLICATION_MODES[number]["id"];
export type ApplicationMode = (typeof APPLICATION_MODES)[number];