import { AxiosError, AxiosHeaders } from "axios";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { FeedbackDialog } from "@/components/applications/feedback-dialog";

/**
 * T042/T043 (KODI-041): a rate-limited feedback submit shows the server's
 * own `detail` in the usual error toast instead of the fixed "Failed to
 * send feedback" text (R-025); any other failure keeps that fixed text.
 */

const create = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    feedbacks: {
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function rateLimitError() {
  const headers = new AxiosHeaders();
  headers.set("retry-after", "30");
  return new AxiosError(
    "Too Many Requests",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 429,
      statusText: "Too Many Requests",
      headers,
      config: {} as never,
      data: { detail: "Too many requests. Try again in 30 seconds." },
    },
  );
}

function serverError() {
  return new AxiosError(
    "Server error",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 500,
      statusText: "Internal Server Error",
      headers: new AxiosHeaders(),
      config: {} as never,
      data: { detail: "Internal error" },
    },
  );
}

async function submitFeedback() {
  const user = userEvent.setup();
  render(<FeedbackDialog open onOpenChange={() => {}} />);
  // Rate a star so the "Please select a rating" guard does not short-circuit
  // before the mocked service call.
  await user.click(screen.getAllByRole("button", { name: "" })[0]!);
  await user.click(screen.getByRole("button", { name: "Send feedback" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedbackDialog — 429 toast (T042)", () => {
  it("shows the server's detail on a 429", async () => {
    create.mockRejectedValueOnce(rateLimitError());

    await submitFeedback();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Too many requests. Try again in 30 seconds.",
      ),
    );
  });

  it("still shows the fixed message on a non-429 failure", async () => {
    create.mockRejectedValueOnce(serverError());

    await submitFeedback();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to send feedback"),
    );
  });
});
