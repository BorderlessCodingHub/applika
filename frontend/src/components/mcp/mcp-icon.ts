import { createLucideIcon } from "lucide-react";

// The 0023 boards draw lucide's older Plug (square top); lucide 1.x redrew it with round corners.
export const McpIcon = createLucideIcon("mcp-plug", [
  ["path", { d: "M12 22v-5", key: "mcp-plug-1" }],
  ["path", { d: "M9 8V2", key: "mcp-plug-2" }],
  ["path", { d: "M15 8V2", key: "mcp-plug-3" }],
  [
    "path",
    { d: "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z", key: "mcp-plug-4" },
  ],
]);
