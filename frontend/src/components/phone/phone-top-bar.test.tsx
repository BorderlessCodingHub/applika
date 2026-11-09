import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { PhoneTopBar } from "./phone-top-bar";

describe("PhoneTopBar", () => {
  it("is a banner with the back link named after the screen it returns to", () => {
    render(<PhoneTopBar href="/account" label="Account" />);

    const link = screen.getByRole("link", { name: "Account" });
    expect(link).toHaveAttribute("href", "/account");
    expect(screen.getByRole("banner")).toContainElement(link);
  });

  it("hands its empty end slot to endRef, after the back link", () => {
    const end = createRef<HTMLDivElement>();
    render(<PhoneTopBar href="/reports" label="Reports" endRef={end} />);

    expect(end.current).toHaveAttribute("data-slot", "phone-top-bar-end");
    expect(end.current).toBeEmptyDOMElement();
    const link = screen.getByRole("link", { name: "Reports" });
    expect(
      link.compareDocumentPosition(end.current!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
