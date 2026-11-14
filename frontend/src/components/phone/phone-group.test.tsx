import { render, screen } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { PhoneGroup, PhoneGroupRow } from "./phone-group";
import { PhoneBell, PhoneCalendarPlus } from "./phone-icons";

describe("PhoneGroupRow", () => {
  it("says a button row opens a dialog", () => {
    render(
      <PhoneGroup>
        <PhoneGroupRow
          rowKey="edit"
          icon={Pencil}
          label="Edit"
          popup="dialog"
          onClick={vi.fn()}
        />
        <PhoneGroupRow rowKey="cv" label="CV" href="/applications/cv?id=a1" />
      </PhoneGroup>,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(screen.getByRole("link", { name: "CV" })).not.toHaveAttribute(
      "aria-haspopup",
    );
  });

  it("opens nothing by default", () => {
    render(
      <PhoneGroup>
        <PhoneGroupRow label="Logout" onClick={vi.fn()} />
      </PhoneGroup>,
    );
    expect(screen.getByRole("button", { name: "Logout" })).not.toHaveAttribute(
      "aria-haspopup",
    );
  });
});

describe("the boards' older lucide icons", () => {
  it.each([
    ["PhoneCalendarPlus", PhoneCalendarPlus, 6],
    ["PhoneBell", PhoneBell, 2],
  ] as const)("draws %s", (_name, Icon, paths) => {
    const { container } = render(<Icon size={16} aria-hidden="true" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path")).toHaveLength(paths);
  });
});
