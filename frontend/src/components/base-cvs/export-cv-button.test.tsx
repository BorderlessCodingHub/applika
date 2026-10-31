import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CvDocumentPreview } from "@/components/base-cvs/cv-document-preview";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import { CV_EXPORT_COPY } from "@/components/base-cvs/types";
import {
  cvDiffMarkdownFilename,
  cvDiffPdfFilename,
  cvFilenameSlug,
  cvMarkdownFilename,
  cvPdfFilename,
  downloadBlob,
  parseContentDispositionFilename,
} from "@/lib/pdf-download";

/**
 * The PDF export affordance (KODI-004).
 *
 * Three things are pinned here, all of them acceptance criteria rather than
 * styling:
 *
 * - AC3, twice: the words "the preview is not the PDF" sit BOTH next to the
 *   download action and next to the preview itself, and the one beside the
 *   button is tied to it by `aria-describedby` rather than by proximity alone.
 * - AC1's frontend half, in part: the only thing that ever disables the button
 *   is a render already in flight. There is no `disabled` prop, so no caller
 *   can lock it on a finalized or archived CV copy.
 * - AC2's frontend half: the filename the browser saves under. The server names
 *   the file; when its header does not survive the trip the fallback must
 *   produce the SAME name, so the slug rule is mirrored and tested here.
 *
 * The words are asserted, never the classes.
 */

const CV = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: "",
  summary: "Eight years on payment systems.",
  links: [],
  skills: [
    { id: "s-1", category: "Languages and frameworks", keywords: ["Python"] },
  ],
  education: [],
  experience: [],
  projects: [],
  certifications: [],
  languages: [],
};

describe("the export button", () => {
  it("says the preview is not the PDF, and ties those words to the button", () => {
    render(<ExportCvButton onExport={() => {}} />);

    const button = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });
    const notice = screen.getByText(CV_EXPORT_COPY.layoutNotice);

    expect(notice).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-describedby", notice.id);
    expect(notice.id).not.toBe("");
  });

  it("keeps the notice on the default `inline` layout, which is the editors'", () => {
    // The editors' copy. `CvDocumentPreview`'s `<figcaption>` is the other one,
    // and on `/cvs/new` — where no export button mounts at all — it is the
    // only one. Weakening this would take the notice off an editor screen.
    render(<ExportCvButton onExport={() => {}} layout="inline" />);

    const button = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });
    const notice = screen.getByText(CV_EXPORT_COPY.layoutNotice);

    expect(notice).toBeVisible();
    expect(notice).not.toHaveClass("sr-only");
    expect(button).toHaveAccessibleDescription(CV_EXPORT_COPY.layoutNotice);
  });

  it("says nothing about a preview on the `compact` layout, which renders none", () => {
    render(<ExportCvButton onExport={() => {}} layout="compact" />);

    const button = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });

    // Not `sr-only` — ABSENT. A gallery tile shows no preview, so there is
    // nothing for the words to qualify, and an `sr-only` copy per tile only
    // repeated them to the one user who could not check them against a render.
    expect(screen.queryByText(CV_EXPORT_COPY.layoutNotice)).toBeNull();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("asks for the PDF when clicked", async () => {
    const onExport = vi.fn();
    render(<ExportCvButton onExport={onExport} />);

    await userEvent.click(
      screen.getByRole("button", { name: CV_EXPORT_COPY.pdfLabel }),
    );
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("is enabled by default: nothing but a render in flight locks it", () => {
    render(<ExportCvButton onExport={() => {}} />);

    const button = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(CV_EXPORT_COPY.pdfPending)).toBeNull();
  });

  it("keeps its accessible name while the server renders, and announces the wait", () => {
    render(<ExportCvButton onExport={() => {}} isExporting />);

    // The 1-3s render must not move the locator out from under a test or a
    // screen-reader user: the visible label is the SAME in both states.
    const button = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(CV_EXPORT_COPY.pdfPending)).toBeInTheDocument();
  });

  it("does not fire again while a render is in flight", async () => {
    const onExport = vi.fn();
    render(<ExportCvButton onExport={onExport} isExporting />);

    await userEvent.click(
      screen.getByRole("button", { name: CV_EXPORT_COPY.pdfLabel }),
    );
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe("the Markdown download (KODI-017 part 3)", () => {
  it("renders no Markdown button at all without `onExportMarkdown`", () => {
    render(<ExportCvButton onExport={() => {}} />);
    expect(
      screen.queryByRole("button", { name: CV_EXPORT_COPY.markdownLabel }),
    ).toBeNull();
  });

  it("renders it beside the PDF button when given, same pending pattern", async () => {
    const onExportMarkdown = vi.fn();
    const { rerender } = render(
      <ExportCvButton
        onExport={() => {}}
        onExportMarkdown={onExportMarkdown}
      />,
    );

    const pdfButton = screen.getByRole("button", {
      name: CV_EXPORT_COPY.pdfLabel,
    });
    const markdownButton = screen.getByRole("button", {
      name: CV_EXPORT_COPY.markdownLabel,
    });
    expect(pdfButton).toBeEnabled();
    expect(markdownButton).toBeEnabled();

    await userEvent.click(markdownButton);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);

    rerender(
      <ExportCvButton
        onExport={() => {}}
        onExportMarkdown={onExportMarkdown}
        isExportingMarkdown
      />,
    );
    expect(
      screen.getByRole("button", { name: CV_EXPORT_COPY.markdownLabel }),
    ).toBeDisabled();
    expect(
      screen.getByText(CV_EXPORT_COPY.markdownPending),
    ).toBeInTheDocument();
    // The PDF button is untouched by the Markdown render being in flight.
    expect(
      screen.getByRole("button", { name: CV_EXPORT_COPY.pdfLabel }),
    ).toBeEnabled();
  });

  it("keeps both buttons on the compact layout, with no layout notice", () => {
    render(
      <ExportCvButton
        onExport={() => {}}
        onExportMarkdown={() => {}}
        layout="compact"
      />,
    );
    expect(
      screen.getByRole("button", { name: CV_EXPORT_COPY.pdfLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: CV_EXPORT_COPY.markdownLabel }),
    ).toBeInTheDocument();
    expect(screen.queryByText(CV_EXPORT_COPY.layoutNotice)).toBeNull();
  });
});

describe("the preview", () => {
  it("carries the same notice in its caption (AC3, near the preview)", () => {
    const { container } = render(<CvDocumentPreview cv={CV} />);

    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(caption).toHaveTextContent(CV_EXPORT_COPY.layoutNotice);
  });
});

describe("the download filename", () => {
  it("mirrors the server's slug rule", () => {
    expect(cvFilenameSlug("Backend CV")).toBe("backend-cv");
    expect(cvFilenameSlug("  Senior   Engineer!!  ")).toBe("senior-engineer");
    expect(cvFilenameSlug("CV — 2026 (final)")).toBe("cv-2026-final");
    expect(cvFilenameSlug("Ada_Lovelace.v2")).toBe("ada-lovelace-v2");
    // Nothing left after the rule, so the server's own default.
    expect(cvFilenameSlug("!!!")).toBe("cv");
    expect(cvFilenameSlug("")).toBe("cv");
  });

  it("is the slug plus .pdf", () => {
    expect(cvPdfFilename("Backend CV")).toBe("backend-cv.pdf");
    expect(cvPdfFilename("   ")).toBe("cv.pdf");
  });

  it("is the slug plus .md for the Markdown twin (KODI-017 part 3)", () => {
    expect(cvMarkdownFilename("Backend CV")).toBe("backend-cv.md");
    expect(cvMarkdownFilename("   ")).toBe("cv.md");
  });

  it("suffixes -changes for the diff downloads", () => {
    expect(cvDiffMarkdownFilename("Backend CV")).toBe("backend-cv-changes.md");
    expect(cvDiffPdfFilename("Backend CV")).toBe("backend-cv-changes.pdf");
  });

  it("prefers the name the server sent", () => {
    expect(
      parseContentDispositionFilename('attachment; filename="backend-cv.pdf"'),
    ).toBe("backend-cv.pdf");
    expect(
      parseContentDispositionFilename("attachment; filename=backend-cv.pdf"),
    ).toBe("backend-cv.pdf");
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''curr%C3%ADculo.pdf",
      ),
    ).toBe("currículo.pdf");
  });

  it("falls back when the header is missing or says nothing", () => {
    expect(parseContentDispositionFilename(undefined)).toBeNull();
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename("")).toBeNull();
    expect(parseContentDispositionFilename("attachment")).toBeNull();
    expect(
      parseContentDispositionFilename('attachment; filename=""'),
    ).toBeNull();
  });
});

describe("saving the bytes", () => {
  const createObjectURL = vi.fn(() => "blob:applika/1");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    // Assign onto the real `URL` rather than replacing it: jsdom has no
    // `createObjectURL`, and everything else still needs `new URL(...)`.
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
    vi.clearAllMocks();
  });

  it("hands the blob to the browser under the given name, then frees it", async () => {
    const clicked: Array<{ download: string; href: string }> = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ download: this.download, href: this.href });
      });

    downloadBlob(new Blob(["%PDF-1.7"], { type: "application/pdf" }), "x.pdf");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([{ download: "x.pdf", href: "blob:applika/1" }]);
    // No stray anchor left in the document.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);

    // Revoked on a LATER tick, never synchronously after `click()`: the
    // download starts asynchronously and an early revoke truncates it.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:applika/1"),
    );

    click.mockRestore();
  });
});
