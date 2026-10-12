import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JobListItem } from "./job-list-item";
import { makeJob } from "./job-test-fixtures";
import type { JobSummary } from "@/services/types/jobs";

const NOW = new Date("2026-10-12T12:00:00Z");

function renderItem(job: JobSummary, pending: "dismiss" | null = null) {
  const handlers = {
    onStart: vi.fn(),
    onDismiss: vi.fn(),
    onRestore: vi.fn(),
  };
  render(<JobListItem job={job} now={NOW} pending={pending} {...handlers} />);
  return handlers;
}

describe("JobListItem (T082, AC2, AC11)", () => {
  it("shows every field of the job", () => {
    renderItem(makeJob());
    const card = screen.getByRole("article", {
      name: "Senior Backend Engineer",
    });

    expect(
      within(card).getByRole("link", { name: "Senior Backend Engineer" }),
    ).toHaveAttribute("href", "/jobs/view?id=101");
    expect(within(card).getByText("Acme Remote")).toBeInTheDocument();
    expect(within(card).getByText("Himalayas")).toBeInTheDocument();
    expect(within(card).getByText("Worldwide")).toBeInTheDocument();
    expect(within(card).getByText("Full time")).toBeInTheDocument();
    expect(within(card).getByText("$120k - $150k")).toBeInTheDocument();
    expect(within(card).getByText("python")).toBeInTheDocument();
    expect(within(card).getByText("django")).toBeInTheDocument();
    expect(within(card).getByText("3 days ago")).toHaveAttribute(
      "datetime",
      "2026-10-09T12:00:00Z",
    );
    expect(within(card).getByText("Fit 72%")).toBeInTheDocument();
  });

  it("shows no fit badge when best_fit is null", () => {
    renderItem(makeJob({ best_fit: null }));
    expect(screen.queryByText(/^Fit \d+%$/)).not.toBeInTheDocument();
    expect(screen.queryByText("No fit yet")).not.toBeInTheDocument();
  });

  it("caps the visible tags at six and counts the rest", () => {
    renderItem(makeJob({ tags: ["a", "b", "c", "d", "e", "f", "g", "h"] }));
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByText("g")).not.toBeInTheDocument();
  });

  it("links a draft to the new-with-cv page and keeps Start application", () => {
    renderItem(makeJob({ application: { id: "900", is_draft: true } }));
    expect(screen.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      "/applications/new-with-cv?id=900",
    );
    expect(
      screen.getByRole("button", { name: "Start application" }),
    ).toBeInTheDocument();
  });

  it("links a finished application to the applications list", () => {
    renderItem(makeJob({ application: { id: "901", is_draft: false } }));
    expect(screen.getByRole("link", { name: "Applied" })).toHaveAttribute(
      "href",
      "/applications?focus=901",
    );
    expect(screen.queryByRole("link", { name: "Draft" })).toBeNull();
  });

  it("shows no status link without an application", () => {
    renderItem(makeJob());
    expect(screen.queryByRole("link", { name: "Draft" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Applied" })).toBeNull();
  });

  it("starts and dismisses through its buttons", async () => {
    const job = makeJob();
    const handlers = renderItem(job);
    await userEvent.click(
      screen.getByRole("button", { name: "Start application" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(handlers.onStart).toHaveBeenCalledWith(job);
    expect(handlers.onDismiss).toHaveBeenCalledWith(job);
    expect(handlers.onRestore).not.toHaveBeenCalled();
  });

  it("offers Restore on a dismissed job", async () => {
    const job = makeJob({ dismissed: true });
    const handlers = renderItem(job);
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(handlers.onRestore).toHaveBeenCalledWith(job);
  });

  it("ignores clicks on a mark in flight", async () => {
    const handlers = renderItem(makeJob(), "dismiss");
    const button = screen.getByRole("button", { name: "Dismiss" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(handlers.onDismiss).not.toHaveBeenCalled();
  });
});
