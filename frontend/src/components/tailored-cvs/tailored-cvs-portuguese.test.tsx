import { zodResolver } from "@hookform/resolvers/zod";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { baseCvSchema } from "@/components/base-cvs/base-cv-schema";
import type { CvFormValues } from "@/components/base-cvs/types";
import { renderInPortuguese } from "@/test/portuguese";
import { CvDiffDownloadRow } from "./cv-diff-download-row";
import type { CvDiffSnapshot } from "./cv-diff";
import { CvFitPanel } from "./cv-fit-panel";
import { CvRemovedRow } from "./cv-removed-row";
import { TailoredCvEditor } from "./tailored-cv-editor";
import { TailoredCvReadOnlyBanner } from "./tailored-cv-read-only-banner";
import { tailoredCvSchema } from "./tailored-cv-schema";
import type { TailoredCvAdjustment } from "./types";
import { useCvDiff } from "./use-cv-diff";

/**
 * The CV copy's own chrome in Portuguese. What the API sends as data — the
 * keyword reorder `adjustments[].description` — stays exactly as sent, in
 * English, in both languages (R-021); the user's own words (the master CV's
 * name, the job description) are never translated.
 */

const BASELINE: CvDiffSnapshot = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Eight years on payment systems.",
  links: [],
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

const ADJUSTMENTS: TailoredCvAdjustment[] = [
  {
    section: "skills",
    description: "Moved Python and PostgreSQL to the top of Backend.",
  },
];

function TailoredCopy({
  readOnly = false,
  baseline = BASELINE,
  values = { ...BASELINE, phone: "" },
}: {
  readOnly?: boolean;
  baseline?: CvDiffSnapshot;
  values?: CvFormValues;
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: values,
  });
  const cvDiff = useCvDiff({
    form,
    baseline,
    baselineLabel: "Backend CV",
    readOnly,
    adjustments: ADJUSTMENTS,
  });
  return (
    <TailoredCvEditor
      form={form}
      onSubmit={form.handleSubmit(() => {})}
      baseCvId="1"
      sourceCvName="Backend CV"
      jobDescription="Senior backend engineer, Python."
      diffSummary={cvDiff.diffSummary}
      diff={cvDiff.slots}
      onDelete={() => {}}
      readOnlyReason={readOnly ? "finalized" : undefined}
    />
  );
}

describe("the CV copy in Portuguese", () => {
  it("translates the copy view's chrome and shows adjustments.description as sent", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<TailoredCopy />);

    // Provenance and panels: Portuguese chrome, user content untouched.
    expect(screen.getByText("Copiado de Backend CV")).toBeInTheDocument();
    expect(screen.getByText("Descrição da vaga")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Texto da descrição da vaga" }),
    ).toHaveTextContent("Senior backend engineer, Python.");
    expect(
      screen.getByRole("region", { name: "Pré-visualização do CV" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pré-visualização")).toBeInTheDocument();
    expect(
      screen.getByText("Comparado com Backend CV: nenhuma alteração"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar cópia do CV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir esta cópia do CV" }),
    ).toHaveTextContent("Excluir cópia");

    await user.click(screen.getByLabelText("Mostrar alterações"));

    const list = screen.getByRole("list", {
      name: "Reordenado pela aderência à vaga",
    });
    // R-021: the API's sentence, verbatim and English, under a Portuguese title.
    expect(within(list).getByRole("listitem")).toHaveTextContent(
      /^Moved Python and PostgreSQL to the top of Backend\.$/,
    );
    expect(screen.queryByText("Reordered by job match")).toBeNull();
    expect(screen.queryByText("Show changes")).toBeNull();
  });

  it("translates the delete dialog", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<TailoredCopy />);
    await user.click(
      screen.getByRole("button", { name: "Excluir esta cópia do CV" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Excluir esta cópia do CV?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Excluir" }),
    ).toBeInTheDocument();
  });

  it("says why a copy is read-only in Portuguese", async () => {
    await renderInPortuguese(<TailoredCvReadOnlyBanner reason="archived" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Esta candidatura está em um ciclo encerrado",
    );
  });

  it("translates the fit panel and the diff download row", async () => {
    await renderInPortuguese(
      <>
        <CvFitPanel isError onRetry={vi.fn()} />
        <CvDiffDownloadRow
          onExportPdf={vi.fn()}
          onExportMarkdown={vi.fn()}
          dirty
        />
      </>,
    );
    expect(screen.getByText("Aderência do CV à vaga")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a aderência a esta vaga.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar de novo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Baixar alterações em PDF" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Os downloads refletem a última versão salva."),
    ).toBeInTheDocument();
  });

  it("names a removed row in Portuguese and keeps the user's title", async () => {
    await renderInPortuguese(
      <CvRemovedRow
        itemId="x-1"
        itemNoun="experiência"
        title="Backend Engineer"
        onRestore={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("group", {
        name: "Item removido (experiência): Backend Engineer",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Restaurar experiência Backend Engineer",
      }),
    ).toHaveTextContent("Restaurar");
  });

  it("shows a language level in the diff in Portuguese; the stored value stays English", async () => {
    const user = userEvent.setup();
    const baseline: CvDiffSnapshot = {
      ...BASELINE,
      languages: [
        { id: "l-1", name: "English", level: "Native" },
        { id: "l-2", name: "Spanish", level: "Basic" },
      ],
    };
    await renderInPortuguese(
      <TailoredCopy
        baseline={baseline}
        values={{
          ...BASELINE,
          phone: "",
          languages: [{ id: "l-1", name: "English", level: "Proficient" }],
        }}
      />,
    );
    await user.click(screen.getByLabelText("Mostrar alterações"));

    // The removed row's caption: the level in Portuguese, the name as typed.
    const removed = await screen.findByRole("group", {
      name: "Item removido (idioma): Spanish",
    });
    expect(removed).toHaveTextContent("Básico");
    expect(removed).not.toHaveTextContent("Basic");

    // The changed marker's original value: "Native" reads "Nativo".
    await user.click(screen.getByRole("button", { name: /^Alterado: / }));
    const original = await screen.findByLabelText("Valor original");
    expect(original).toHaveTextContent(/^Nativo$/);
  });

  it("validates in Portuguese", async () => {
    await renderInPortuguese(<span />);
    const result = tailoredCvSchema.safeParse({
      ...BASELINE,
      phone: "",
      email: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "O e-mail é obrigatório",
    );
  });

  it("groups a length limit the Portuguese way; English keeps the plain digits", async () => {
    const tooLong = { ...BASELINE, phone: "", summary: "x".repeat(4001) };
    const english = tailoredCvSchema.safeParse(tooLong);
    expect(english.error?.issues.map((issue) => issue.message)).toContain(
      "Keep this under 4000 characters",
    );
    expect(
      baseCvSchema.safeParse(tooLong).error?.issues.map((i) => i.message),
    ).toContain("Keep this under 4000 characters");
    await renderInPortuguese(<span />);
    const portuguese = tailoredCvSchema.safeParse(tooLong);
    expect(portuguese.error?.issues.map((issue) => issue.message)).toContain(
      "Use menos de 4.000 caracteres",
    );
    // The master CV schema shares the helper.
    expect(
      baseCvSchema.safeParse(tooLong).error?.issues.map((i) => i.message),
    ).toContain("Use menos de 4.000 caracteres");
  });
});
