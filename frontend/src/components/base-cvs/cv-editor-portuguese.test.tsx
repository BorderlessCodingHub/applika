import { zodResolver } from "@hookform/resolvers/zod";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { BaseCvEditor } from "./base-cv-editor";
import {
  baseCvSchema,
  baseCvToFormValues,
  emptyBaseCvValues,
} from "./base-cv-schema";
import { CvDocumentPreview } from "./cv-document-preview";
import type { BaseCv, CvFormValues } from "./types";

/**
 * The master CV editor in Portuguese: the form, its buttons, hints and
 * validation messages are app text and translate; the CV text the user typed
 * does not; and the preview INSIDE the sheets stays the English twin of the
 * PDF (the API typesets the PDF in English), while the chrome around it — the
 * layout notice, the page indicator, the page count — is Portuguese.
 */

const CV: BaseCv = {
  id: "7001",
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London, United Kingdom",
  email: "ada@example.com",
  phone: null,
  summary: "Backend engineer with eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: [{ id: "s-1", category: "Backend", keywords: ["Python"] }],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      role: "Senior Backend Engineer",
      start: "2021-03",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [],
  education: [
    {
      id: "d-1",
      institution: "University of Edinburgh",
      degree: "BSc",
      start: "2010-09",
      end: "2013-06",
    },
  ],
  certifications: [],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
  created_at: "2026-01-02T10:00:00Z",
  updated_at: "2026-01-03T10:00:00Z",
};

function Harness({ defaults }: { defaults: CvFormValues }) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: defaults,
  });
  return (
    <BaseCvEditor
      form={form}
      onSubmit={form.handleSubmit(vi.fn())}
      onCancel={vi.fn()}
    />
  );
}

describe("the master CV editor in Portuguese", () => {
  it("translates the section titles, the footer and the field labels, never the CV text", async () => {
    await renderInPortuguese(<Harness defaults={baseCvToFormValues(CV)} />);

    for (const title of [
      "Identidade e contato",
      "Links",
      "Resumo",
      "Habilidades",
      "Experiência",
      "Projetos",
      "Formação",
      "Certificações",
      "Idiomas",
    ]) {
      expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Salvar CV" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Adicionar experiência" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome completo" })).toHaveValue(
      "Ada Lovelace",
    );
    expect(
      screen.getByText("Só você vê isto. É o nome do CV na sua lista."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Pré-visualização do CV" }),
    ).toBeInTheDocument();

    for (const english of ["Save CV", "Cancel", "Identity and contact"]) {
      expect(
        screen.queryByRole("button", { name: english }),
      ).not.toBeInTheDocument();
    }
  });

  it("translates the language level menu, while the stored level and the preview stay English", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<Harness defaults={baseCvToFormValues(CV)} />);
    const preview = screen.getByRole("complementary", {
      name: "Pré-visualização do CV",
    });

    const level = screen.getByRole("combobox", { name: "Nível" });
    expect(level).toHaveTextContent(/^Nativo$/);
    expect(within(preview).getByText(/Native/)).toBeInTheDocument();

    await user.click(level);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Nativo",
      "Fluente",
      "Conversação",
      "Leitura e compreensão",
      "Básico",
    ]);

    await user.click(screen.getByRole("option", { name: "Fluente" }));
    expect(level).toHaveTextContent(/^Fluente$/);
    // The value kept is the English level the PDF prints.
    expect(within(preview).getByText(/Proficient/)).toBeInTheDocument();
    expect(within(preview).queryByText(/Fluente|Nativo/)).toBeNull();
  });

  it("says the validation messages in Portuguese", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<Harness defaults={emptyBaseCvValues()} />);

    await user.click(screen.getByRole("button", { name: "Salvar CV" }));

    expect(
      await screen.findByText("Informe seu nome completo"),
    ).toBeInTheDocument();
    expect(screen.getByText("O nome do CV é obrigatório")).toBeInTheDocument();
    expect(screen.queryByText("Your full name is required")).toBeNull();
  });
});

describe("the CV preview under pt-BR", () => {
  it("keeps the sheets the English twin of the PDF while the chrome around them is Portuguese", async () => {
    await renderInPortuguese(<CvDocumentPreview cv={CV} />);

    const sheets = screen.getByRole("article", {
      name: "Pré-visualização do CV de Ada Lovelace",
    });
    // Inside the sheets: the PDF's English section headings, as printed.
    for (const heading of ["Summary", "Experience", "Education", "Languages"]) {
      expect(within(sheets).getByText(heading)).toBeInTheDocument();
    }
    for (const portuguese of ["Resumo", "Experiência", "Formação", "Idiomas"]) {
      expect(within(sheets).queryByText(portuguese)).toBeNull();
    }
    // The CV text itself is the user's, untouched.
    expect(within(sheets).getByText("Ada Lovelace")).toBeInTheDocument();

    // Around the sheets: app chrome, in Portuguese.
    expect(
      screen.getByText("A pré-visualização não mostra o layout final do PDF."),
    ).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(
      screen.getByText("Pré-visualização do CV: 1 página."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Páginas da pré-visualização do CV" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Preview does not show the final PDF layout."),
    ).toBeNull();
  });
});
