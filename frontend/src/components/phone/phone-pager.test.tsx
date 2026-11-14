import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";
import { PhonePager } from "./phone-pager";

describe("PhonePager", () => {
  it("renders nothing with one page or none (PRD 0022)", () => {
    for (const totalPages of [0, 1]) {
      const { container, unmount } = render(
        <PhonePager page={1} totalPages={totalPages} onPageChange={vi.fn()} />,
      );
      expect(container, `${totalPages} pages`).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("draws Previous, Page N of M and Next in the board's row", () => {
    render(<PhonePager page={2} totalPages={5} onPageChange={vi.fn()} />);

    const row = document.querySelector<HTMLElement>(
      '[data-slot="phone-pager"]',
    )!;
    expect(row.tagName).toBe("DIV");
    expect(row).toHaveClass("ph-pager");
    const [previous, next] = within(row).getAllByRole("button");
    expect(previous).toHaveAccessibleName("Previous page");
    expect(next).toHaveAccessibleName("Next page");
    for (const button of [previous, next]) {
      expect(button).toHaveClass("ph-iconbtn");
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
    const label = within(row).getByText("Page 2 of 5");
    expect(label).toHaveClass("ph-mono", "ph-pager-n");
    expect(label).toHaveAttribute("aria-live", "polite");
    // DOM order is the board's: Previous, the words, Next.
    expect(Array.from(row.children)).toEqual([previous, label, next]);
  });

  it("names a nav landmark when given a label", () => {
    render(
      <PhonePager
        page={1}
        totalPages={2}
        onPageChange={vi.fn()}
        label="Company pages"
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Company pages" }),
    ).toHaveAttribute("data-slot", "phone-pager");
  });

  it("keeps an end focusable and announced unavailable, and never pages past it", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PhonePager page={1} totalPages={3} onPageChange={onPageChange} />,
    );

    const previous = screen.getByRole("button", { name: "Previous page" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).not.toBeDisabled();
    await user.click(previous);
    expect(previous).toHaveFocus();
    expect(onPageChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    rerender(
      <PhonePager page={3} totalPages={3} onPageChange={onPageChange} />,
    );
    const next = screen.getByRole("button", { name: "Next page" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    await user.click(next);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("speaks Portuguese", async () => {
    await renderInPortuguese(
      <PhonePager page={1} totalPages={3} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Página anterior" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próxima página" }),
    ).toBeInTheDocument();
  });
});
