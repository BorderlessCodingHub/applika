import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/load-messages";
import { setTranslatorLocale } from "@/i18n/translator";
import { genAgendaStepIcsFile } from "@/lib/calendar";

/**
 * R-008/R-027: the calendar file's SUMMARY and file name follow the new
 * hyphenated `stageLabel`, but the UID line — the event's identity inside the
 * file — keeps the OLD "·" text, so re-importing an already-downloaded event
 * updates the same entry instead of creating a duplicate. If `stageLabel`'s
 * separator is ever reverted to "·" without touching `legacyStageLabel`, the
 * SUMMARY/filename assertions below fail (they pin the CURRENT hyphen), and
 * if `legacyStageLabel` is accidentally deleted or made to follow `stageLabel`,
 * the UID assertion fails instead — either revert breaks a test here.
 */

function baseStep() {
  return {
    step_date: "2026-09-18",
    event_type: "interview" as const,
    interview_type: "technical" as const,
    company_name: "Acme",
    role: "Backend Engineer",
    start_time: "14:00:00",
    end_time: "15:00:00",
    application_id: "app-1",
  };
}

let clickedAnchor: HTMLAnchorElement | undefined;
let icsText: string | undefined;
const OriginalBlob = globalThis.Blob;

describe("genAgendaStepIcsFile", () => {
  beforeEach(() => {
    // jsdom implements neither `URL.createObjectURL`/`revokeObjectURL` nor
    // `Blob.prototype.text`; capture the ICS content straight from the
    // `Blob` constructor's parts instead of round-tripping through either.
    URL.createObjectURL = vi.fn(
      () => "blob:mock",
    ) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    vi.spyOn(globalThis, "Blob").mockImplementation(
      (parts?: BlobPart[], options?: BlobPropertyBag) => {
        icsText = (parts ?? []).join("");
        return new OriginalBlob(parts, options);
      },
    );
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        clickedAnchor = el as HTMLAnchorElement;
        vi.spyOn(el, "click").mockImplementation(() => {});
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clickedAnchor = undefined;
    icsText = undefined;
  });

  it('the UID line uses the OLD "·" stage text (R-008)', () => {
    genAgendaStepIcsFile(baseStep());
    expect(icsText).toContain(
      "UID:app-1-20260918-Interview · Technical@applika",
    );
  });

  it('SUMMARY and the file name carry "Interview - Technical" (R-027)', () => {
    genAgendaStepIcsFile(baseStep());
    expect(icsText).toContain("SUMMARY:Acme — Interview - Technical");
    expect(clickedAnchor?.download).toBe("Acme-Interview - Technical.ics");
  });

  it("an untimed step encodes DTSTART/DTEND as VALUE=DATE", () => {
    genAgendaStepIcsFile({
      ...baseStep(),
      start_time: undefined,
      end_time: undefined,
    });
    expect(icsText).toContain("DTSTART;VALUE=DATE:20260918");
    expect(icsText).toContain("DTEND;VALUE=DATE:20260919");
  });

  it("fails on revert: the UID must NOT follow the hyphenated stageLabel", () => {
    genAgendaStepIcsFile(baseStep());
    expect(icsText).not.toContain(
      "UID:app-1-20260918-Interview - Technical@applika",
    );
  });

  function uidLine(text: string | undefined): string | undefined {
    return text?.split("\r\n").find((line) => line.startsWith("UID:"));
  }

  it("in pt-BR, SUMMARY, the file name and the description follow the language", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    genAgendaStepIcsFile({ ...baseStep(), observation: "Bring a laptop" });
    expect(icsText).toContain("SUMMARY:Acme — Entrevista - Técnica");
    expect(clickedAnchor?.download).toBe("Acme-Entrevista - Técnica.ics");
    // Labels translated; company, role and notes are the user's words, as sent.
    expect(icsText).toContain(
      "DESCRIPTION:Cargo: Backend Engineer — Empresa: Acme — Anotações: Bring a laptop — Gerenciado pelo Applika.dev",
    );
  });

  it("the UID line is byte-identical in en and pt-BR, and equals the legacy en value", async () => {
    genAgendaStepIcsFile(baseStep());
    const english = uidLine(icsText);
    expect(english).toBe("UID:app-1-20260918-Interview · Technical@applika");

    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    genAgendaStepIcsFile(baseStep());
    const portuguese = uidLine(icsText);
    expect(icsText).toContain("SUMMARY:Acme — Entrevista - Técnica");
    expect(portuguese).toBe(english);
  });

  it("every stage keeps its English UID under pt-BR", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    const cases = [
      ["interview", "take_home", "Interview · Take-home"],
      ["interview", "hiring_manager", "Interview · Hiring manager"],
      ["interview", null, "Interview · Unknown"],
      ["offer", null, "Offer"],
      ["denied", null, "Denied"],
    ] as const;
    for (const [event_type, interview_type, label] of cases) {
      genAgendaStepIcsFile({ ...baseStep(), event_type, interview_type });
      expect(uidLine(icsText)).toBe(`UID:app-1-20260918-${label}@applika`);
    }
  });
});
