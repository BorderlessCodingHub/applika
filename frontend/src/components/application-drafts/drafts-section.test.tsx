import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DraftsSection,
  type DraftsSectionItem,
} from "@/components/application-drafts/drafts-section";

/** PRD 0010 (KODI-033, T077): AC11/AC13. */

const DRAFT: DraftsSectionItem = {
  id: "d-1",
  company_name: "Acme Inc",
  role: "Senior Engineer",
  has_cv: true,
  updated_at: new Date().toISOString(),
};

describe("DraftsSection", () => {
  it("renders nothing while loading", () => {
    const { container } = render(
      <DraftsSection drafts={undefined} isLoading onDelete={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is absent when there are no drafts", () => {
    const { container } = render(
      <DraftsSection drafts={[]} onDelete={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
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
