import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isValidWebhookUrl } from "./report-webhooks-page";

/**
 * Parity between the web's `isValidWebhookUrl` and the server's
 * `validate_webhook_url`: both suites read
 * `applika/backend/tests/fixtures/report-webhook-urls.json`
 * (`{"accept": [{url, why}], "refuse": [{url, why}]}`), so changing one
 * pattern without the other fails a test. The backend owns the file. A
 * missing file FAILS this suite, naming the path; it never skips itself.
 */
const FIXTURE = resolve(
  __dirname,
  "../../../../../../backend/tests/fixtures/report-webhook-urls.json",
);

interface UrlCase {
  url: string;
  why: string;
}

function loadCases(): { accept: UrlCase[]; refuse: UrlCase[] } {
  if (!existsSync(FIXTURE)) {
    throw new Error(`Webhook URL fixture not found at ${FIXTURE}`);
  }
  return JSON.parse(readFileSync(FIXTURE, "utf-8"));
}

const cases = loadCases();

describe("webhook URL parity with the API", () => {
  it("reads a non-empty fixture", () => {
    expect(cases.accept.length).toBeGreaterThan(0);
    expect(cases.refuse.length).toBeGreaterThan(0);
  });

  it.each(cases.accept)("accepts $why", ({ url }) => {
    expect(isValidWebhookUrl(url)).toBe(true);
  });

  it.each(cases.refuse)("refuses $why", ({ url }) => {
    expect(isValidWebhookUrl(url)).toBe(false);
  });
});
