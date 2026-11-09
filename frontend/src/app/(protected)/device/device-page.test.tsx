import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatSessionTime } from "@/components/profile/devices-copy";
import { services } from "@/services/services";
import type { DeviceCodeInfo } from "@/services/types/auth";
import { mockPhoneViewport } from "@/test/phone";
import { DevicePage } from "./device-page";

/**
 * `/device` (ADR-0019): the code (prefilled from `?code=`), the request card
 * with the device's name, IP and request time, Approve / Deny, and the
 * server's own 404/409 words. At md and up today's card; below md the
 * v2/DeviceSignIn views on the same mutations (`useIsPhone`).
 */

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/services/services", () => ({
  services: {
    auth: {
      verifyDeviceCode: vi.fn(),
      approveDeviceCode: vi.fn(),
      denyDeviceCode: vi.fn(),
    },
  },
}));

const REQUEST: DeviceCodeInfo = {
  device_name: "e2e-laptop",
  client_label: "applika-cli 1.1.0",
  ip: "198.51.100.23",
  requested_at: "2026-10-15T10:00:00Z",
  expires_at: "2026-10-15T10:10:00Z",
};

function apiError(status: number, detail: string) {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data: { detail },
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DevicePage />
    </QueryClientProvider>,
  );
}

const codeInput = () => screen.getByLabelText("Device code");
const continueButton = () => screen.getByRole("button", { name: "Continue" });

beforeEach(() => {
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.mocked(services.auth.verifyDeviceCode).mockReset();
  vi.mocked(services.auth.approveDeviceCode).mockReset();
  vi.mocked(services.auth.denyDeviceCode).mockReset();
});

describe("DevicePage", () => {
  it("has the page h1 and prefills the code from ?code=, normalized", () => {
    searchParams = new URLSearchParams("code=bcdf-ghjk");
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in a device" }),
    ).toBeInTheDocument();
    expect(codeInput()).toHaveValue("BCDF-GHJK");
    // Prefilled, not auto-submitted: the user still presses Continue.
    expect(services.auth.verifyDeviceCode).not.toHaveBeenCalled();
  });

  it("typing normalizes the code; an incomplete code is refused on the client", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(codeInput(), "bcdf g");
    expect(codeInput()).toHaveValue("BCDF-G");
    await user.click(continueButton());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter all 8 letters of the code.",
    );
    expect(codeInput()).toHaveFocus();
    expect(services.auth.verifyDeviceCode).not.toHaveBeenCalled();
  });

  it("Continue verifies and shows the request card: device, client, IP, requested at", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    renderPage();

    await user.click(continueButton());

    const card = await screen.findByRole("region", {
      name: "A device wants to sign in",
    });
    expect(services.auth.verifyDeviceCode).toHaveBeenCalledWith("BCDF-GHJK");
    const inCard = within(card);
    expect(inCard.getByText("BCDF-GHJK")).toBeInTheDocument();
    expect(inCard.getByText("e2e-laptop")).toBeInTheDocument();
    expect(inCard.getByText("applika-cli 1.1.0")).toBeInTheDocument();
    expect(inCard.getByText("198.51.100.23")).toBeInTheDocument();
    expect(
      inCard.getByText(formatSessionTime(REQUEST.requested_at)),
    ).toHaveAttribute("dateTime", REQUEST.requested_at);
    expect(
      inCard.getByText("Only approve if you started this sign-in yourself"),
    ).toBeInTheDocument();
    expect(inCard.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(inCard.getByRole("button", { name: "Deny" })).toBeVisible();
  });

  it("a request with no IP says 'Not recorded'", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue({
      ...REQUEST,
      ip: null,
    });
    renderPage();

    await user.click(continueButton());

    expect(await screen.findByText("Not recorded")).toBeInTheDocument();
  });

  it("Approve signs the device in and links to the Devices tab", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockResolvedValue(undefined);
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByRole("heading", {
        name: "Device signed in. You can return to your terminal.",
      }),
    ).toBeInTheDocument();
    expect(services.auth.approveDeviceCode).toHaveBeenCalledWith("BCDF-GHJK");
    expect(services.auth.denyDeviceCode).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "See your devices" }),
    ).toHaveAttribute("href", "/profile?tab=devices");
  });

  it("Deny refuses the device and offers another code", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.denyDeviceCode).mockResolvedValue(undefined);
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Deny" }));

    expect(
      await screen.findByRole("heading", {
        name: "Sign-in denied. The device was not signed in.",
      }),
    ).toBeInTheDocument();
    expect(services.auth.denyDeviceCode).toHaveBeenCalledWith("BCDF-GHJK");
    expect(services.auth.approveDeviceCode).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Enter another code" }),
    );
    expect(codeInput()).toHaveValue("");
  });

  it("a verify 404 shows the server's words on the form, and typing clears them", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockRejectedValue(
      apiError(404, "Code not found or expired"),
    );
    renderPage();

    await user.click(continueButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Code not found or expired",
      ),
    );
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");

    await user.type(codeInput(), "{backspace}");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("a verify while pending is aria-busy", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await user.click(continueButton());

    await waitFor(() =>
      expect(continueButton()).toHaveAttribute("aria-busy", "true"),
    );
  });

  it("an approve 409 shows 'Code already used' on the card", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockRejectedValue(
      apiError(409, "Code already used"),
    );
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="device-request-error"]'),
      ).toHaveTextContent("Code already used"),
    );
  });

  it("a deny 404 shows 'Code not found or expired' on the card", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.denyDeviceCode).mockRejectedValue(
      apiError(404, "Code not found or expired"),
    );
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Deny" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="device-request-error"]'),
      ).toHaveTextContent("Code not found or expired"),
    );
  });

  it("while approving, both buttons are aria-disabled and Approve is aria-busy", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await user.click(continueButton());
    const approve = await screen.findByRole("button", { name: "Approve" });
    await user.click(approve);

    await waitFor(() => expect(approve).toHaveAttribute("aria-busy", "true"));
    expect(approve).toHaveAttribute("aria-disabled", "true");
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny).toHaveAttribute("aria-disabled", "true");
    await user.click(deny);
    expect(services.auth.denyDeviceCode).not.toHaveBeenCalled();
  });

  it("'Use a different code' goes back to an empty form", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    renderPage();

    await user.click(continueButton());
    await user.click(
      await screen.findByRole("button", { name: "Use a different code" }),
    );

    expect(codeInput()).toHaveValue("");
  });

  it("a non-JSON failure shows a fixed sentence, never 'undefined'", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockRejectedValue(
      new Error("Network Error"),
    );
    renderPage();

    await user.click(continueButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong. Try again.",
      ),
    );
  });

  it("while denying, Deny is aria-busy and Approve is locked", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.denyDeviceCode).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await user.click(continueButton());
    const deny = await screen.findByRole("button", { name: "Deny" });
    await user.click(deny);

    await waitFor(() => expect(deny).toHaveAttribute("aria-busy", "true"));
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).not.toHaveAttribute("aria-busy");
    expect(approve).toHaveAttribute("aria-disabled", "true");
    await user.click(approve);
    expect(services.auth.approveDeviceCode).not.toHaveBeenCalled();
  });
});

describe("DevicePage below md (v2/DeviceSignIn)", () => {
  const form = () =>
    document.querySelector<HTMLElement>('[data-slot="device-code-form"]')!;
  const codeError = () =>
    document.querySelector<HTMLElement>('[data-slot="device-code-error"]')!;

  it("renders the board's code step, not today's card, with ?code= prefilled once", () => {
    mockPhoneViewport();
    searchParams = new URLSearchParams("code=bcdf-ghjk");
    renderPage();

    expect(form()).toHaveClass("ph-app");
    expect(document.querySelector('[data-slot="device-sign-in"]')).toBeNull();
    expect(
      within(form()).getByRole("heading", {
        level: 1,
        name: "Sign in a device",
      }),
    ).toBeInTheDocument();
    expect(codeInput()).toHaveValue("BCDF-GHJK");
    expect(codeInput()).toHaveFocus();
    expect(codeInput()).toHaveAccessibleDescription(
      "8 letters, shown in your terminal as XXXX-XXXX.",
    );
    expect(services.auth.verifyDeviceCode).not.toHaveBeenCalled();
  });

  it("refuses an incomplete code on the client, in the field", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderPage();

    await user.type(codeInput(), "bcdf g");
    expect(codeInput()).toHaveValue("BCDF-G");
    await user.click(continueButton());

    expect(codeError()).toHaveAttribute("role", "alert");
    expect(codeError()).toHaveTextContent("Enter all 8 letters of the code.");
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    expect(codeInput()).toHaveFocus();
    expect(services.auth.verifyDeviceCode).not.toHaveBeenCalled();
  });

  it("goes from the code to the request, with its warning, then approve to the outcome", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockResolvedValue(undefined);
    renderPage();

    await user.click(continueButton());

    const request = await screen.findByRole("region", {
      name: "A device wants to sign in",
    });
    expect(request).toHaveAttribute("data-slot", "device-request");
    const inRequest = within(request);
    expect(
      request.querySelector('[data-slot="device-request-code"]'),
    ).toHaveTextContent("BCDF-GHJK");
    expect(
      request.querySelector('[data-slot="device-request-name"]'),
    ).toHaveTextContent("e2e-laptop");
    expect(inRequest.getByText("applika-cli 1.1.0")).toBeInTheDocument();
    expect(inRequest.getByText("198.51.100.23")).toBeInTheDocument();
    expect(
      inRequest.getByText(formatSessionTime(REQUEST.requested_at)),
    ).toHaveAttribute("dateTime", REQUEST.requested_at);
    const warning = inRequest.getByRole("note");
    expect(warning).toHaveAttribute("data-slot", "device-request-warning");
    expect(warning).toHaveTextContent(
      "Only approve if you started this sign-in yourself",
    );
    expect(warning).toHaveTextContent(
      "If someone sent you this code or link, deny it.",
    );

    await user.click(inRequest.getByRole("button", { name: "Approve" }));

    const outcome = await screen.findByRole("status");
    expect(outcome).toHaveAttribute("data-slot", "device-outcome");
    expect(outcome).toHaveAttribute("data-outcome", "approved");
    expect(
      within(outcome).getByRole("heading", {
        level: 1,
        name: "Device signed in. You can return to your terminal.",
      }),
    ).toBeInTheDocument();
    expect(
      within(outcome).getByRole("link", { name: "See your devices" }),
    ).toHaveAttribute("href", "/profile?tab=devices");
    expect(services.auth.approveDeviceCode).toHaveBeenCalledWith("BCDF-GHJK");
    expect(services.auth.denyDeviceCode).not.toHaveBeenCalled();
  });

  it("deny goes to the denied outcome, and Enter another code starts over", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.denyDeviceCode).mockResolvedValue(undefined);
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Deny" }));

    const outcome = await screen.findByRole("status");
    expect(outcome).toHaveAttribute("data-outcome", "denied");
    expect(outcome).toHaveTextContent(
      "Sign-in denied. The device was not signed in.",
    );
    expect(services.auth.denyDeviceCode).toHaveBeenCalledWith("BCDF-GHJK");
    expect(services.auth.approveDeviceCode).not.toHaveBeenCalled();

    await user.click(
      within(outcome).getByRole("button", { name: "Enter another code" }),
    );
    expect(codeInput()).toHaveValue("");
    expect(form()).toBeInTheDocument();
  });

  it("shows a verify 404's words in the field, and typing clears them", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockRejectedValue(
      apiError(404, "Code not found or expired"),
    );
    renderPage();

    await user.click(continueButton());

    await waitFor(() =>
      expect(codeError()).toHaveTextContent("Code not found or expired"),
    );
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    await user.type(codeInput(), "{backspace}");
    expect(codeError()).toBeEmptyDOMElement();
  });

  it("a non-JSON verify failure shows the fixed sentence", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockRejectedValue(
      new Error("Network Error"),
    );
    renderPage();

    await user.click(continueButton());

    await waitFor(() =>
      expect(codeError()).toHaveTextContent("Something went wrong. Try again."),
    );
  });

  it("a verify in flight is aria-busy and does not send twice", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await user.click(continueButton());
    await waitFor(() =>
      expect(continueButton()).toHaveAttribute("aria-busy", "true"),
    );
    expect(continueButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(continueButton());
    expect(services.auth.verifyDeviceCode).toHaveBeenCalledTimes(1);
  });

  it("shows an approve 409 in the action bar, above Deny and Approve", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockRejectedValue(
      apiError(409, "Code already used"),
    );
    renderPage();

    await user.click(continueButton());
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    const error = document.querySelector<HTMLElement>(
      '[data-slot="device-request-error"]',
    )!;
    await waitFor(() => expect(error).toHaveTextContent("Code already used"));
    expect(error).toHaveAttribute("role", "alert");
    expect(error.closest('[data-slot="phone-action-bar"]')).toContainElement(
      screen.getByRole("button", { name: "Approve" }),
    );
  });

  it("while approving, both are aria-disabled, Approve is aria-busy, Deny does nothing", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    vi.mocked(services.auth.approveDeviceCode).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await user.click(continueButton());
    const approve = await screen.findByRole("button", { name: "Approve" });
    await user.click(approve);

    await waitFor(() => expect(approve).toHaveAttribute("aria-busy", "true"));
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Use a different code" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(deny);
    expect(services.auth.denyDeviceCode).not.toHaveBeenCalled();
  });

  it("'Use a different code' goes back to an empty code step", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    renderPage();

    await user.click(continueButton());
    await user.click(
      await screen.findByRole("button", { name: "Use a different code" }),
    );

    expect(codeInput()).toHaveValue("");
  });

  it("keeps the step when the screen crosses md", async () => {
    const viewport = mockPhoneViewport();
    const user = userEvent.setup();
    searchParams = new URLSearchParams("code=BCDF-GHJK");
    vi.mocked(services.auth.verifyDeviceCode).mockResolvedValue(REQUEST);
    renderPage();

    await user.click(continueButton());
    // Both widths share the data hooks (e2e reads either); the look differs.
    const request = () =>
      document.querySelector('[data-slot="device-request"]');
    await screen.findByRole("region", { name: "A device wants to sign in" });
    expect(request()).toHaveClass("ph-app");

    viewport.setPhone(false);

    expect(request()).not.toHaveClass("ph-app");
    expect(
      document.querySelector('[data-slot="device-sign-in"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("e2e-laptop")).toBeInTheDocument();
    expect(services.auth.verifyDeviceCode).toHaveBeenCalledTimes(1);
  });
});
