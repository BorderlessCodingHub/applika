import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CatalogSelect,
  type CatalogOption,
} from "@/components/applications/catalog-select";
import { PLATFORM_SELECT_COPY } from "@/components/applications/platform-select";
import { COMPANY_SELECT_COPY } from "@/components/applications/company-select";

/** KODI-035: the shared picker behind both the platform and company fields. */

const OPTIONS: CatalogOption[] = [
  { id: "p-1", name: "LinkedIn", url: "https://linkedin.com", is_public: true },
  { id: "p-2", name: "Niche Board", url: null, is_public: false },
];

function setup(
  overrides: Partial<React.ComponentProps<typeof CatalogSelect>> = {},
) {
  const onValueChange = vi.fn();
  const onCreate = vi.fn();
  render(
    <CatalogSelect
      kind="platform"
      copy={PLATFORM_SELECT_COPY}
      nameMax={100}
      urlMax={200}
      options={OPTIONS}
      value=""
      onValueChange={onValueChange}
      onCreate={onCreate}
      exactMatchReplacesCreate
      aria-label="Platform"
      {...overrides}
    />,
  );
  return { onValueChange, onCreate };
}

describe("CatalogSelect", () => {
  it("debounces onSearchChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSearchChange = vi.fn();
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    setup({ onSearchChange });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "link",
    );

    expect(onSearchChange).not.toHaveBeenCalledWith("link");
    vi.advanceTimersByTime(300);
    expect(onSearchChange).toHaveBeenCalledWith("link");
    vi.useRealTimers();
  });

  it("hides Create for an exact match only when exactMatchReplacesCreate", async () => {
    const user = userEvent.setup();
    setup({ exactMatchReplacesCreate: true });
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "linkedin",
    );
    expect(screen.queryByText('Create "linkedin"')).not.toBeInTheDocument();
  });

  it("keeps Create offered on an exact match when exactMatchReplacesCreate is false", async () => {
    const user = userEvent.setup();
    setup({
      exactMatchReplacesCreate: false,
      copy: COMPANY_SELECT_COPY,
    });
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "linkedin",
    );
    expect(await screen.findByText('Create "linkedin"')).toBeInTheDocument();
  });

  it("opens the create form with name and URL and reports the outcome", async () => {
    const user = userEvent.setup();
    const { onCreate, onValueChange } = setup();
    onCreate.mockResolvedValue({
      status: "created",
      option: { id: "p-3", name: "Wellfound", url: null, is_public: false },
    });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "Wellfound",
    );
    await user.click(await screen.findByText('Create "Wellfound"'));
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Wellfound");
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ name: "Wellfound", url: null }),
    );
    expect(onValueChange).toHaveBeenCalledWith("p-3", {
      id: "p-3",
      name: "Wellfound",
      url: null,
      is_public: false,
    });
  });

  it("shows a private option with Only you", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    const nicheRow = (await screen.findByText("Niche Board")).closest(
      '[role="option"]',
    ) as HTMLElement;
    expect(nicheRow).toHaveTextContent("Only you");
  });

  it("shows the notice after a successful create with the reused message", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    onCreate.mockResolvedValue({
      status: "exists",
      message: "A platform with this name already exists: LinkedIn",
      option: OPTIONS[0],
    });

    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "linkedln",
    );
    await user.click(await screen.findByText('Create "linkedln"'));
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    expect(
      await screen.findByText(
        /A platform with this name already exists: LinkedIn/,
      ),
    ).toBeInTheDocument();
  });
});
