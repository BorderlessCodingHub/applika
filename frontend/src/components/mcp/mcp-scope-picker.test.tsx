import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import {
  DEFAULT_MCP_SCOPE,
  MCP_SCOPE_CHOICES,
  MCP_SCOPE_OF,
  McpScopePicker,
  mcpScopeChoice,
  type McpScopeChoice,
} from "./mcp-scope-picker";
import { McpScopeChip } from "./mcp-scope-chip";

/**
 * PRD 0023 AC9: three choices — "Read only" (`read`), "Read and write"
 * (`read write`, preselected, Recommended) and "Full access"
 * (`read write delete`) — each saying what it allows. Every token holds
 * `read`; deleting has its own scope.
 */

function Picker({
  variant,
  onChange = vi.fn(),
}: {
  variant: "desktop" | "phone";
  onChange?: (choice: McpScopeChoice) => void;
}) {
  const [value, setValue] = useState<McpScopeChoice>(DEFAULT_MCP_SCOPE);
  return (
    <McpScopePicker
      variant={variant}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("the scope choices", () => {
  it("are read, read and write, full, in order; each holds read; only full deletes", () => {
    expect(MCP_SCOPE_CHOICES).toEqual(["read", "read_write", "full"]);
    expect(MCP_SCOPE_OF).toEqual({
      read: ["read"],
      read_write: ["read", "write"],
      full: ["read", "write", "delete"],
    });
    for (const choice of MCP_SCOPE_CHOICES) {
      expect(MCP_SCOPE_OF[choice]).toContain("read");
    }
    expect(
      MCP_SCOPE_CHOICES.filter((choice) =>
        MCP_SCOPE_OF[choice].includes("delete"),
      ),
    ).toEqual(["full"]);
    expect(DEFAULT_MCP_SCOPE).toBe("read_write");
  });

  it("reads a session's scope back as its choice, in any order", () => {
    expect(mcpScopeChoice(["read"])).toBe("read");
    expect(mcpScopeChoice(["write", "read"])).toBe("read_write");
    expect(mcpScopeChoice(["delete", "read", "write"])).toBe("full");
    expect(mcpScopeChoice(["read", "delete"])).toBeNull();
    expect(mcpScopeChoice([])).toBeNull();
    expect(mcpScopeChoice(null)).toBeNull();
    expect(mcpScopeChoice(undefined)).toBeNull();
  });
});

describe.each(["desktop", "phone"] as const)(
  "McpScopePicker (%s)",
  (variant) => {
    it("offers three radios named by their titles, Read and write checked and Recommended", () => {
      render(<Picker variant={variant} />);

      const group = screen.getByRole("radiogroup", { name: "What can it do?" });
      const radios = within(group).getAllByRole("radio");
      expect(
        radios.map((radio) => radio.getAttribute("aria-labelledby")),
      ).not.toContain(null);
      expect(
        within(group)
          .getAllByRole("radio")
          .map((radio) => [
            radio.getAttribute("data-scope"),
            radio.getAttribute("data-scope-names"),
          ]),
      ).toEqual([
        ["read", "read"],
        ["read_write", "read write"],
        ["full", "read write delete"],
      ]);
      expect(
        within(group).getByRole("radio", { name: "Read only" }),
      ).not.toBeChecked();
      const recommended = within(group).getByRole("radio", {
        name: "Read and write",
      });
      expect(recommended).toBeChecked();
      expect(recommended).toHaveAccessibleDescription(
        "Recommended Also create, edit, close and reopen applications, add and edit timeline events, and write CVs.",
      );
      expect(
        within(group).getByRole("radio", { name: "Full access" }),
      ).toHaveAccessibleDescription(
        "Also delete timeline events, master CVs and application CVs. Deleting can’t be undone.",
      );
      expect(
        within(group).getByRole("radio", { name: "Read only" }),
      ).toHaveAccessibleDescription(
        "Look up and read applications, timeline events, CVs, platforms and companies.",
      );
      expect(within(group).getAllByText("Recommended")).toHaveLength(1);
    });

    it("changes the choice on a click", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Picker variant={variant} onChange={onChange} />);

      await user.click(screen.getByRole("radio", { name: "Full access" }));

      expect(onChange).toHaveBeenLastCalledWith("full");
      expect(screen.getByRole("radio", { name: "Full access" })).toBeChecked();
      expect(
        screen.getByRole("radio", { name: "Read and write" }),
      ).not.toBeChecked();

      await user.click(screen.getByRole("radio", { name: "Read only" }));
      expect(onChange).toHaveBeenLastCalledWith("read");
    });
  },
);

describe("McpScopePicker looks", () => {
  it("phone: the board's .ph-opt cards, the checked one .ph-on", () => {
    render(<Picker variant="phone" />);

    const checked = screen.getByRole("radio", { name: "Read and write" });
    expect(checked).toHaveClass("ph-opt", "ph-mt-opt", "ph-on");
    expect(screen.getByRole("radio", { name: "Read only" })).not.toHaveClass(
      "ph-on",
    );
    expect(screen.getByText("Recommended")).toHaveClass("ph-mt-rec");
  });

  it("disabled: no choice changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<McpScopePicker value="read_write" onChange={onChange} disabled />);

    await user.click(screen.getByRole("radio", { name: "Full access" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("speaks Portuguese", async () => {
    await renderInPortuguese(<Picker variant="desktop" />);

    const group = screen.getByRole("radiogroup", {
      name: "O que ele pode fazer?",
    });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("data-scope")),
    ).toEqual(["read", "read_write", "full"]);
    expect(
      within(group).getByRole("radio", { name: "Leitura e escrita" }),
    ).toBeChecked();
    expect(within(group).getByText("Recomendado")).toBeInTheDocument();
  });
});

describe("McpScopeChip", () => {
  it.each([
    [["read"], "Read only", "read", "bg-muted"],
    [["read", "write"], "Read and write", "read_write", "bg-primary-muted"],
    [["read", "write", "delete"], "Full access", "full", "bg-warning/22"],
  ])("desktop %j: %s", (scope, words, choice, tone) => {
    render(<McpScopeChip scope={scope} />);

    const chip = screen.getByText(words).closest('[data-slot="mcp-scope"]');
    expect(chip).toHaveAttribute("data-scope", choice);
    expect(chip).toHaveClass(tone);
  });

  it.each([
    [["read"], "Read only", []],
    [["read", "write"], "Read and write", ["ph-pri"]],
    [["read", "write", "delete"], "Full access", ["ph-mt-full"]],
  ])("phone %j: the board's pill", (scope, words, tones) => {
    render(<McpScopeChip variant="phone" scope={scope} />);

    const chip = screen.getByText(words).closest('[data-slot="mcp-scope"]');
    expect(chip).toHaveClass("ph-pill", ...tones);
  });

  it("shows nothing for a web or CLI row, and an unknown set by its names", () => {
    const { container, rerender } = render(<McpScopeChip scope={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<McpScopeChip scope={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<McpScopeChip scope={["read", "delete"]} />);
    expect(screen.getByText("read delete")).toBeInTheDocument();
  });

  it("speaks Portuguese", async () => {
    await renderInPortuguese(<McpScopeChip scope={["read"]} />);

    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
  });
});
