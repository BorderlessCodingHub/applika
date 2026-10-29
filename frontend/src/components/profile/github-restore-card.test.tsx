import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GithubRestoreCard } from "./github-restore-card";
import { GithubRestoreNotice } from "./github-restore-notice";
import { GITHUB_RESTORE_NOTICE_COPY } from "./github-restore-copy";

/** The profile's GitHub restore card and the restore outcome notices (ADR-0024). */

describe("GithubRestoreCard", () => {
  it("offers Restore data from GitHub and says what GitHub is asked for", async () => {
    const onRestore = vi.fn();
    render(<GithubRestoreCard onRestore={onRestore} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Old GitHub account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/applika reads your GitHub user id once/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Restore data from GitHub" }),
    );
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("while pending it is locked and never starts twice", async () => {
    const onRestore = vi.fn();
    render(<GithubRestoreCard onRestore={onRestore} pending />);

    const button = screen.getByRole("button", {
      name: "Restore data from GitHub",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(onRestore).not.toHaveBeenCalled();
  });
});

describe("GithubRestoreNotice", () => {
  it("restored is a status, the refusals are alerts", () => {
    const { rerender } = render(<GithubRestoreNotice status="restored" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      GITHUB_RESTORE_NOTICE_COPY.restored,
    );

    for (const status of [
      "not_found",
      "has_data",
      "already_bound",
      "error",
    ] as const) {
      rerender(<GithubRestoreNotice status={status} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        GITHUB_RESTORE_NOTICE_COPY[status],
      );
    }
  });

  it("already_bound explains the old account has another Borderless account", () => {
    render(<GithubRestoreNotice status="already_bound" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not restored: that old applika account is already linked to another Borderless account.",
    );
  });
});
