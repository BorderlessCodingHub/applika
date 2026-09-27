import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  PlatformSelect,
  type PlatformOption,
} from "@/components/applications/platform-select";

/** PRD 0010 (KODI-033, T082): the shared creatable platform picker. */

const OPTIONS: PlatformOption[] = [
  { id: "p-1", name: "LinkedIn", url: "https://linkedin.com", is_public: true },
  { id: "p-2", name: "Niche Board", url: null, is_public: false },
];

function setup(
  overrides: Partial<React.ComponentProps<typeof PlatformSelect>> = {},
) {
  const onValueChange = vi.fn();
  const onCreate = vi.fn();
  render(
    <PlatformSelect
      options={OPTIONS}
      value=""
      onValueChange={onValueChange}
      onCreate={onCreate}
      aria-label="Platform"
      {...overrides}
    />,
  );
  return { onValueChange, onCreate };
}

describe("PlatformSelect", () => {
  it("lists a url-null platform without error", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    expect(await screen.findByText("Niche Board")).toBeInTheDocument();
  });

  it("badges the private platform, not the public one", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    const nicheRow = (await screen.findByText("Niche Board")).closest(
      '[role="option"]',
    ) as HTMLElement;
    expect(nicheRow).toHaveTextContent("Only you");
    const linkedinRow = screen
      .getByText("LinkedIn")
      .closest('[role="option"]') as HTMLElement;
    expect(linkedinRow).not.toHaveTextContent("Only you");
  });

  it("offers an exact case-different match from the list, not Create (AC17)", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "linkedin",
    );
    expect(await screen.findByText("LinkedIn")).toBeInTheDocument();
    expect(screen.queryByText('Create "linkedin"')).not.toBeInTheDocument();
  });

  it("creates a platform with a URL", async () => {
    const user = userEvent.setup();
    const { onCreate, onValueChange } = setup();
    onCreate.mockResolvedValue({
      status: "created",
      platform: {
        id: "p-3",
        name: "Wellfound",
        url: "https://wellfound.com",
        is_public: false,
      },
    });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "Wellfound",
    );
    await user.click(await screen.findByText('Create "Wellfound"'));
    await user.type(screen.getByLabelText(/^url/i), "https://wellfound.com");
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Wellfound",
        url: "https://wellfound.com",
      }),
    );
    expect(onValueChange).toHaveBeenCalledWith("p-3");
  });

  it("creates a platform with no URL", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    onCreate.mockResolvedValue({
      status: "created",
      platform: { id: "p-4", name: "Bare Board", url: null, is_public: false },
    });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "Bare Board",
    );
    await user.click(await screen.findByText('Create "Bare Board"'));
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ name: "Bare Board", url: null }),
    );
  });

  it("on a 409, selects the existing platform and shows the server message verbatim", async () => {
    const user = userEvent.setup();
    const { onCreate, onValueChange } = setup();
    onCreate.mockResolvedValue({
      status: "exists",
      message: "A platform with this name already exists: LinkedIn",
      platform: OPTIONS[0],
    });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "linkedln",
    );
    await user.click(await screen.findByText('Create "linkedln"'));
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("p-1"));
    expect(
      screen.getByText(/A platform with this name already exists: LinkedIn/),
    ).toBeInTheDocument();
  });
});
