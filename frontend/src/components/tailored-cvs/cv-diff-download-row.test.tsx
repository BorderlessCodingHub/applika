import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CV_DIFF_DOWNLOAD_DIRTY_NOTICE,
  CV_DIFF_DOWNLOAD_PENDING,
  CvDiffDownloadRow,
} from "./cv-diff-download-row";

/**
 * The copy editor's "Download changes" row (KODI-017 part 3).
 *
 * Pinned: PDF and Markdown are two DISTINCT accessible names ("Download
 * changes as PDF" / "Download changes as Markdown"), never plain "PDF"/
 * "Markdown" alone — a Playwright substring match on "PDF" would otherwise
 * also catch the unrelated "Download PDF" button the same screen renders
 * (the designer's getByLabel ambiguity note, applied to these buttons too).
 */
describe("CvDiffDownloadRow", () => {
  it("fires the right mutation per button", async () => {
    const onExportPdf = vi.fn();
    const onExportMarkdown = vi.fn();
    render(
      <CvDiffDownloadRow
        onExportPdf={onExportPdf}
        onExportMarkdown={onExportMarkdown}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Download changes as PDF" }),
    );
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Download changes as Markdown" }),
    );
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
  });

  it("announces the pending render without moving either button's name", () => {
    render(
      <CvDiffDownloadRow
        onExportPdf={() => {}}
        onExportMarkdown={() => {}}
        isExportingPdf
      />,
    );
    expect(
      screen.getByRole("button", { name: "Download changes as PDF" }),
    ).toBeDisabled();
    // The OTHER button is disabled too — only one render at a time.
    expect(
      screen.getByRole("button", { name: "Download changes as Markdown" }),
    ).toBeDisabled();
    expect(screen.getByText(CV_DIFF_DOWNLOAD_PENDING)).toBeInTheDocument();
  });

  it("disables both buttons and shows the server's reason", () => {
    render(
      <CvDiffDownloadRow
        onExportPdf={() => {}}
        onExportMarkdown={() => {}}
        disabledReason="This CV copy has no baseline to compare with."
      />,
    );
    const pdf = screen.getByRole("button", { name: "Download changes as PDF" });
    expect(pdf).toBeDisabled();
    expect(
      screen.getByText("This CV copy has no baseline to compare with."),
    ).toBeInTheDocument();
    expect(pdf).toHaveAttribute("aria-describedby");
  });

  it("says downloads reflect the last saved version while the form is dirty", () => {
    render(
      <CvDiffDownloadRow
        onExportPdf={() => {}}
        onExportMarkdown={() => {}}
        dirty
      />,
    );
    expect(screen.getByText(CV_DIFF_DOWNLOAD_DIRTY_NOTICE)).toBeInTheDocument();
  });

  it("says nothing about being dirty when the form is clean", () => {
    render(
      <CvDiffDownloadRow onExportPdf={() => {}} onExportMarkdown={() => {}} />,
    );
    expect(
      screen.queryByText(CV_DIFF_DOWNLOAD_DIRTY_NOTICE),
    ).not.toBeInTheDocument();
  });
});
