import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    /*
     * A machine-speed budget, not an assertion budget — nothing here decides
     * whether a test passes, only how long it may take to decide.
     *
     * The CV editor journeys drive ~60 real keystrokes through a form that
     * re-renders itself AND the live document preview on every one of them,
     * and KODI-009 put a Radix disclosure around each of the nine sections:
     * measured, that is ~33% more work per render (1865ms -> 2476ms on
     * `new-cv-page`, isolated). The default 5s was already 84% spent by that
     * one test before this slice when the whole suite runs in parallel, so it
     * failed on contention alone. 15s leaves room without hiding a real hang.
     */
    testTimeout: 15_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
