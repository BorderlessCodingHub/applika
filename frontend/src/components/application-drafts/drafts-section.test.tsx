import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DraftsSection,
  type DraftsSectionItem,
} from "@/components/application-drafts/drafts-section";

/**
 * PRD 0010 (KODI-033, T077): AC11/AC13. Revised KODI-036, T142: this is now
 * the Drafts TAB's whole body (AC2/AC8) — no own heading (the tab trigger
 * already says "Drafts"), and it stays VISIBLE with no drafts instead of
 * rendering `null`, offering a way to start one.
 */

const DRAFT: DraftsSectionItem = {
  id: "d-1",
  company_name: "Acme Inc",
  role: "Senior Engineer",
  has_cv: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("DraftsSection", () => {
  it("renders nothing while loading", () => {
    const { container } = render(
      <DraftsSection drafts={undefined} isLoading onDelete={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stays visible with no drafts, saying there are none, with a way to start one (AC8)", () => {
    render(<DraftsSection drafts={[]} onDelete={vi.fn()} />);

    expect(screen.getByText("No drafts yet.")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "New with CV" });
    expect(cta).toHaveAttribute("href", "/applications/new-with-cv");
  });

  it("leaves the tab on its empty state once the last draft's row is gone", () => {
    const { rerender } = render(
      <DraftsSection drafts={[DRAFT]} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();

    rerender(<DraftsSection drafts={[]} onDelete={vi.fn()} />);

    expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();
    expect(screen.getByText("No drafts yet.")).toBeInTheDocument();
  });

  it("lists a draft with company, role, last-saved and a Resume link to ?id=", () => {
    render(<DraftsSection drafts={[DRAFT]} onDelete={vi.fn()} />);

    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    const resume = screen.getByRole("link", {
      name: /resume senior engineer at acme inc/i,
    });
    expect(resume).toHaveAttribute("href", "/applications/new-with-cv?id=d-1");
  });

  it("falls back to created_at when updated_at is null, never 'Saved 56 years ago' (KODI-036 B2)", () => {
    const neverUpdated: DraftsSectionItem = {
      ...DRAFT,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    render(<DraftsSection drafts={[neverUpdated]} onDelete={vi.fn()} />);

    expect(screen.getByText("Saved just now")).toBeInTheDocument();
    expect(screen.queryByText(/1969|1970/)).not.toBeInTheDocument();
  });

  it("Delete asks for confirmation; Cancel keeps the row", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<DraftsSection drafts={[DRAFT]} onDelete={onDelete} />);

    await user.click(
      screen.getByRole("button", {
        name: /delete draft senior engineer at acme inc/i,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
  });

  it("Delete confirmed calls onDelete with the draft", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<DraftsSection drafts={[DRAFT]} onDelete={onDelete} />);

    await user.click(
      screen.getByRole("button", {
        name: /delete draft senior engineer at acme inc/i,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete draft" }),
    );

    expect(onDelete).toHaveBeenCalledWith(DRAFT);
  });
});
