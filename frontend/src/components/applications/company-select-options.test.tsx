import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompanyOptionsList } from "@/components/applications/company-select-options";
import type { Company } from "@/services/types/applications";

/** PRD 0010 (KODI-033, T084/AC15): "Only you" on a private company row. */

const COMPANIES: Company[] = [
  { id: "c-1", name: "Acme Public", url: "", is_public: true },
  { id: "c-2", name: "Acme Private", url: "", is_public: false },
];

describe("CompanyOptionsList — private row badge (AC15)", () => {
  it("badges the private company, not the public one", async () => {
    const fetchCompanies = vi.fn().mockResolvedValue(COMPANIES);
    const user = userEvent.setup();

    render(
      <CompanyOptionsList
        inputValue=""
        onInputChange={() => {}}
        fetchCompanies={fetchCompanies}
        onSelect={() => {}}
        onCreateNew={() => {}}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Acme");

    const privateRow = (await screen.findByText("Acme Private")).closest(
      '[cmdk-item=""]',
    ) as HTMLElement;
    expect(privateRow).toHaveTextContent("Only you");

    const publicRow = screen
      .getByText("Acme Public")
      .closest('[cmdk-item=""]') as HTMLElement;
    expect(publicRow).not.toHaveTextContent("Only you");
  });
});
