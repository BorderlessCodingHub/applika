import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { MCP_COPIED_MS, McpCopyButton } from "./mcp-copy-button";

const writeText = vi.fn();

/** After `userEvent.setup()`, which puts its own clipboard in place. */
function mockClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

function WithText({
  variant,
  copiedMs,
}: {
  variant: "phone" | "desk-text";
  copiedMs?: number;
}) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div>
      <pre ref={ref}>applika_mcp_fake_value</pre>
      <McpCopyButton
        variant={variant}
        text="applika_mcp_fake_value"
        label="Copy the token"
        doneLabel="Token copied"
        selectOnFail={ref}
        copiedMs={copiedMs}
        data-action="copy-token"
      />
    </div>
  );
}

describe("McpCopyButton", () => {
  it("copies, says Copied once in a status, then goes back (two seconds in the app)", async () => {
    const user = userEvent.setup();
    mockClipboard();
    render(<WithText variant="desk-text" copiedMs={200} />);
    const button = screen.getByRole("button", { name: "Copy the token" });
    expect(button).toHaveTextContent("Copy");
    expect(button).toHaveAttribute("data-action", "copy-token");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("applika_mcp_fake_value");
    expect(
      screen.getByRole("button", { name: "Token copied" }),
    ).toHaveAttribute("data-done", "true");
    expect(button).toHaveTextContent("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("Token copied");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy the token" }),
      ).toHaveAttribute("data-done", "false"),
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(MCP_COPIED_MS).toBe(2000);
  });

  it("a refused clipboard selects the text so it can still be copied, and says so", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    mockClipboard();
    render(<WithText variant="phone" />);

    await user.click(screen.getByRole("button", { name: "Copy the token" }));

    expect(window.getSelection()?.toString()).toBe("applika_mcp_fake_value");
    expect(
      screen.getByRole("button", { name: "Copy the token" }),
    ).toHaveAttribute("data-done", "false");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copying is blocked here. The text is selected: copy it by hand.",
    );
  });

  it("the phone icon button has no visible words, only its name", () => {
    render(<WithText variant="phone" />);

    const button = screen.getByRole("button", { name: "Copy the token" });
    expect(button).toHaveTextContent("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("says Copiar / Copiado in Portuguese", async () => {
    const user = userEvent.setup();
    mockClipboard();
    await renderInPortuguese(
      <McpCopyButton
        variant="desk-text"
        text="x"
        label="Copiar o token"
        doneLabel="Token copiado"
      />,
    );

    const button = screen.getByRole("button", { name: "Copiar o token" });
    expect(button).toHaveTextContent("Copiar");
    await user.click(button);
    expect(button).toHaveTextContent("Copiado");
  });
});
