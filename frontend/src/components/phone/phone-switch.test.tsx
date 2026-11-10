import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhoneSwitch } from "./phone-switch";

function Harness({ onChange }: { onChange: (next: boolean) => void }) {
  const [on, setOn] = useState(true);
  return (
    <PhoneSwitch
      checked={on}
      aria-label="Collect from RemoteOK"
      onCheckedChange={(next) => {
        onChange(next);
        setOn(next);
      }}
    />
  );
}

describe("PhoneSwitch", () => {
  it("is a switch named by its aria-label that flips on a tap", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const control = screen.getByRole("switch", {
      name: "Collect from RemoteOK",
    });
    expect(control).toBeChecked();
    expect(control).toHaveClass("ph-switch");
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(control).not.toBeChecked();
  });
});
