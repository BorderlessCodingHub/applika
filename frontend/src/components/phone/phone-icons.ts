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

// signin/C_Desktop draws Newspaper without the box lucide 1.x added.
export const PhoneNewspaperC = createLucideIcon("phone-newspaper-c", [
  ["path", { d: "M15 18h-5", key: "phone-newspaper-c-1" }],
  ["path", { d: "M18 14h-8", key: "phone-newspaper-c-2" }],
  [
    "path",
    {
      d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2",
      key: "phone-newspaper-c-3",
    },
  ],
]);

// v2/Welcome draws lucide's outline GitHub mark, which lucide 1.x dropped.
export const PhoneGithub = createLucideIcon("phone-github", [
  [
    "path",
    {
      d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
      key: "phone-github-1",
    },
  ],
  ["path", { d: "M9 18c-4.51 2-5-2-7-2", key: "phone-github-2" }],
]);

// v2/Today's add-to-calendar draws lucide's older CalendarPlus (its corner ends at 13 / h8).
export const PhoneCalendarPlus = createLucideIcon("phone-calendar-plus", [
  ["path", { d: "M8 2v4", key: "phone-calendar-plus-1" }],
  ["path", { d: "M16 2v4", key: "phone-calendar-plus-2" }],
  [
    "path",
    {
      d: "M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8",
      key: "phone-calendar-plus-3",
    },
  ],
  ["path", { d: "M3 10h18", key: "phone-calendar-plus-4" }],
  ["path", { d: "M16 19h6", key: "phone-calendar-plus-5" }],
  ["path", { d: "M19 16v6", key: "phone-calendar-plus-6" }],
]);

// v2/Schedule's sound-alert bell is lucide's older Bell; lucide 1.x redrew it.
export const PhoneBell = createLucideIcon("phone-bell", [
  [
    "path",
    { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "phone-bell-1" },
  ],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "phone-bell-2" }],
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
