import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  ConfirmMembershipForm,
  confirmMembershipReason,
} from "./confirm-membership-form";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * "Sign in again to confirm your membership" (ADR-0024): the Borderless
 * password renews the access and keeps the applika session; the user and the
 * report queries are refetched; the server's words land inline.
 */

vi.mock("@/services/services", () => ({
  services: { auth: { confirmMembership: vi.fn() } },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER: Pick<User, "badges" | "borderless"> = {
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: {
    status: "expired",
    expires_at: "2026-10-20T00:00:00Z",
    email: "ada@borderless.example",
  },
};

function refusal(status: number, detail: string, code?: string) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data: code ? { detail, code } : { detail },
  });
}

function renderForm(user = USER) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onConfirmed = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ConfirmMembershipForm user={user} onConfirmed={onConfirmed} />
    </QueryClientProvider>,
  );
  return { invalidate, onConfirmed };
}

function errorBox() {
  return document.querySelector('[data-slot="confirm-membership-error"]')!;
}

beforeEach(() => {
  vi.mocked(services.auth.confirmMembership).mockReset();
  vi.mocked(toast.success).mockClear();
});

describe("ConfirmMembershipForm", () => {
  it("asks to sign in again, says why, and prefills the Borderless email", () => {
    renderForm();

    expect(
      screen.getByRole("heading", {
        name: "Sign in again to confirm your membership",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your Borderless access expired, so your PSP badge is paused.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue(
      "ada@borderless.example",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("confirms with the password, refetches the user and reports, keeps the session", async () => {
    vi.mocked(services.auth.confirmMembership).mockResolvedValue();
    const user = userEvent.setup();
    const { invalidate, onConfirmed } = renderForm();

    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Confirm membership" }),
    );

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(services.auth.confirmMembership).toHaveBeenCalledWith({
      email: "ada@borderless.example",
      password: "secret",
    });
    for (const key of [["user", "me"], ["reports"], ["report"]]) {
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: key }),
      );
    }
    expect(toast.success).toHaveBeenCalledWith("Membership confirmed");
  });

  it.each([
    [401, "Invalid email or password", "AUTH-1004"],
    [403, "Verify your email on Borderless first", "AUTH-1005"],
    [
      409,
      "This is not the Borderless account linked to your applika account",
      "AUTH-1010",
    ],
    [429, "Too many sign-in attempts. Try again in 30 seconds.", undefined],
    [503, "Borderless is unavailable, try again later", "AUTH-1017"],
  ])("%i shows the server's words", async (status, detail, code) => {
    vi.mocked(services.auth.confirmMembership).mockRejectedValue(
      refusal(status, detail, code),
    );
    const user = userEvent.setup();
    const { onConfirmed } = renderForm();

    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Confirm membership" }),
    );

    await waitFor(() => expect(errorBox()).toHaveTextContent(detail));
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("401 clears the password and focuses it", async () => {
    vi.mocked(services.auth.confirmMembership).mockRejectedValue(
      refusal(401, "Invalid email or password"),
    );
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(
      screen.getByRole("button", { name: "Confirm membership" }),
    );

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent("Invalid email or password"),
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("is pending while the confirm runs", async () => {
    vi.mocked(services.auth.confirmMembership).mockReturnValue(
      new Promise(() => {}),
    );
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Confirm membership" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm membership" }),
      ).toHaveAttribute("aria-disabled", "true"),
    );
  });
});

describe("confirmMembershipReason", () => {
  it("names the paused badge, or the access alone", () => {
    expect(confirmMembershipReason("needs_reconnect", "borderless_base")).toBe(
      "Borderless did not accept applika's last check, so your BASE badge is paused.",
    );
    expect(confirmMembershipReason("expired", null)).toBe(
      "Your Borderless access expired.",
    );
    expect(confirmMembershipReason("active", "borderless_psp")).toBeNull();
  });
});
