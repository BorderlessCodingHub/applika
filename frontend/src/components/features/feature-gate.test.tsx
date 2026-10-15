import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureGate } from "./feature-gate";
import { NOT_FOUND_COPY } from "@/components/layout/not-found-message";

/** KODI-053: children with the feature, a spinner while loading, else the app's 404. */

const getMine = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMine(...args) },
  },
}));

const Child = vi.fn(() => <p>gated content</p>);

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeatureGate feature="jobs">
        <Child />
      </FeatureGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMine.mockReset();
  Child.mockClear();
});

describe("FeatureGate", () => {
  it("renders the children for a user who has the feature", async () => {
    getMine.mockResolvedValue([{ key: "jobs", stage: "beta" }]);
    renderGate();

    expect(await screen.findByText("gated content")).toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND_COPY.code)).not.toBeInTheDocument();
  });

  it("renders the app's page-not-found words without it, and never mounts the children", async () => {
    getMine.mockResolvedValue([]);
    renderGate();

    expect(
      await screen.findByRole("heading", { name: "404", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Home" }),
    ).toHaveAttribute("href", "/");
    expect(document.querySelector('[data-slot="not-found"]')).toHaveAttribute(
      "data-variant",
      "shell",
    );
    expect(Child).not.toHaveBeenCalled();
  });

  it("renders the page-not-found when the features call fails", async () => {
    getMine.mockRejectedValue(new Error("500"));
    renderGate();

    expect(
      await screen.findByRole("heading", { name: "404", level: 1 }),
    ).toBeInTheDocument();
    expect(Child).not.toHaveBeenCalled();
  });

  it("shows a spinner while the features load, and nothing else", () => {
    getMine.mockReturnValue(new Promise(() => {}));
    renderGate();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-slot", "feature-gate-loading");
    expect(status).toHaveTextContent("Loading");
    expect(screen.queryByText("404")).not.toBeInTheDocument();
    expect(Child).not.toHaveBeenCalled();
  });
});
