import {
  Calendar,
  ChartLine,
  createLucideIcon,
  History,
  House,
  Newspaper,
  Search,
} from "lucide-react";

// The boards draw lucide's older Kanban and FileText; lucide 1.x redrew both.
export const PhoneKanban = createLucideIcon("phone-kanban", [
  ["path", { d: "M6 5v11", key: "phone-kanban-1" }],
  ["path", { d: "M12 5v6", key: "phone-kanban-2" }],
  ["path", { d: "M18 5v14", key: "phone-kanban-3" }],
]);

export const PhoneFileText = createLucideIcon("phone-file-text", [
  [
    "path",
    {
      d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
      key: "phone-file-text-1",
    },
  ],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "phone-file-text-2" }],
  ["path", { d: "M10 9H8", key: "phone-file-text-3" }],
  ["path", { d: "M16 13H8", key: "phone-file-text-4" }],
  ["path", { d: "M16 17H8", key: "phone-file-text-5" }],
]);

export const PHONE_TAB_ICONS = {
  "/dashboard": House,
  "/applications": PhoneKanban,
  "/agenda": Calendar,
  "/insights": ChartLine,
} as const;

export const ACCOUNT_WORKSPACE_ICONS = {
  "/jobs": Search,
  "/cvs": PhoneFileText,
  "/reports": Newspaper,
  "/cycles": History,
} as const;
