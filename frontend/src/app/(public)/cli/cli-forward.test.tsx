import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { CliForward } from "./cli-forward";
import Page, { metadata } from "./page";

beforeEach(() => {
  replace.mockReset();
});

describe("/cli", () => {
  it("forwards an old link to the MCP page, replacing the history entry", () => {
    const { container } = render(<CliForward />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/mcp");
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the forward and is not indexed: /mcp is canonical", () => {
    render(<Page />);

    expect(replace).toHaveBeenCalledWith("/mcp");
    expect(metadata.alternates?.canonical).toBe("/mcp");
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
