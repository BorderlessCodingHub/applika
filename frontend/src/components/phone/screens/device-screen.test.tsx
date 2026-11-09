import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { formatSessionTime } from "@/components/profile/devices-copy";
import type { DeviceCodeInfo } from "@/services/types/auth";

import {
  PhoneDeviceCode,
  PhoneDeviceOutcome,
  PhoneDeviceRequest,
} from "./device-screen";

/**
 * v2/DeviceSignIn's three steps on today's props (`components/device/*`):
 * the page test drives them through the real mutations; these pin each view.
 */

const REQUEST: DeviceCodeInfo = {
  device_name: "ada-laptop",
  client_label: "applika-cli 1.1.0",
  ip: null,
  requested_at: "2026-10-15T10:00:00Z",
  expires_at: "2026-10-15T10:10:00Z",
};

describe("PhoneDeviceCode", () => {
  it("does not take focus unless asked, and normalizes what is typed", async () => {
    const user = userEvent.setup();
    const onCodeChange = vi.fn();
    render(
      <PhoneDeviceCode
        code=""
        onCodeChange={onCodeChange}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Device code");

    expect(input).not.toHaveFocus();
    expect(input).toHaveClass("ph-input", "ph-mono", "ph-device-code");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "9");
    expect(input).toHaveAttribute("placeholder", "XXXX-XXXX");
    await user.type(input, "b");
    expect(onCodeChange).toHaveBeenLastCalledWith("B");
  });

  it("submits a complete code once, and nothing while pending", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <PhoneDeviceCode
        code="BCDF-GHJK"
        onCodeChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledWith("BCDF-GHJK");

    rerender(
      <PhoneDeviceCode
        code="BCDF-GHJK"
        onCodeChange={vi.fn()}
        onSubmit={onSubmit}
        pending
      />,
    );
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg.ph-spin")).not.toBeNull();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows the caller's error in the field, described and invalid", () => {
    render(
      <PhoneDeviceCode
        code="BCDF-GHJK"
        onCodeChange={vi.fn()}
        onSubmit={vi.fn()}
        error="Code not found or expired"
      />,
    );
    const input = screen.getByLabelText("Device code");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Code not found or expired",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "8 letters, shown in your terminal as XXXX-XXXX. Code not found or expired",
    );
  });
});

describe("PhoneDeviceRequest", () => {
  it("lists the request, the warning note, and Not recorded for a missing IP", () => {
    render(
      <PhoneDeviceRequest
        request={REQUEST}
        userCode="BCDF-GHJK"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    const section = screen.getByRole("region", {
      name: "A device wants to sign in",
    });
    const term = (name: string) =>
      within(section).getByText(name, { selector: "dt" }).nextElementSibling;

    expect(term("Code")).toHaveTextContent("BCDF-GHJK");
    expect(term("Device")).toHaveTextContent("ada-laptop");
    expect(term("Client")).toHaveTextContent("applika-cli 1.1.0");
    expect(term("IP address")).toHaveTextContent("Not recorded");
    expect(term("Requested")).toHaveTextContent(
      formatSessionTime(REQUEST.requested_at),
    );
    expect(term("Code expires")).toHaveTextContent(
      formatSessionTime(REQUEST.expires_at),
    );
    expect(within(section).getByRole("note")).toHaveClass("ph-device-note");
    // No "Use a different code" without a handler.
    expect(
      screen.queryByRole("button", { name: "Use a different code" }),
    ).toBeNull();
  });

  it("takes focus on its heading when the step before had it", () => {
    render(
      <PhoneDeviceRequest
        request={REQUEST}
        userCode="BCDF-GHJK"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A device wants to sign in",
      }),
    ).toHaveFocus();
  });

  it("Approve and Deny sit in the fixed action bar, Deny first", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <PhoneDeviceRequest
        request={REQUEST}
        userCode="BCDF-GHJK"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    const bar = document.querySelector<HTMLElement>(
      '[data-slot="phone-action-bar"]',
    )!;
    const [deny, approve] = within(bar).getAllByRole("button");

    expect(deny).toHaveAccessibleName("Deny");
    expect(deny).toHaveClass("ph-btn", "ph-dan");
    expect(approve).toHaveAccessibleName("Approve");
    expect(approve).toHaveClass("ph-btn", "ph-pri");
    await user.click(approve);
    await user.click(deny);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(
      bar.querySelector('[data-slot="device-request-error"]'),
    ).toBeEmptyDOMElement();
  });
});

describe("PhoneDeviceOutcome", () => {
  it("approved: a status with the board's check, its sentence as h1, and the devices link", () => {
    render(<PhoneDeviceOutcome outcome="approved" />);
    const outcome = screen.getByRole("status");

    expect(outcome).toHaveAttribute("data-outcome", "approved");
    const heading = within(outcome).getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      "Device signed in. You can return to your terminal.",
    );
    expect(heading).toHaveFocus();
    expect(
      within(outcome).getByRole("link", { name: "See your devices" }),
    ).toHaveAttribute("href", "/profile?tab=devices");
  });

  it("denied: Enter another code only when the caller can start over", async () => {
    const user = userEvent.setup();
    const onStartOver = vi.fn();
    const { unmount } = render(<PhoneDeviceOutcome outcome="denied" />);
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    render(<PhoneDeviceOutcome outcome="denied" onStartOver={onStartOver} />);
    await user.click(
      screen.getByRole("button", { name: "Enter another code" }),
    );
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
