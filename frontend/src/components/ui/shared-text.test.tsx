import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Calendar } from "@/components/ui/calendar";
import { CommandDialog } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { StarRating } from "@/components/ui/star-rating";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

/**
 * The words the shared primitives carry themselves (accessible names, default
 * button labels) follow the active language; `en` keeps today's words.
 */
function inLocale(locale: "en" | "pt-BR", ui: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : (ptBR as unknown as typeof en)}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const openDialog = (
  <Dialog open>
    <DialogContent>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Body</DialogDescription>
      <DialogFooter showCloseButton />
    </DialogContent>
  </Dialog>
);

const openSheet = (
  <Sheet open>
    <SheetContent>
      <SheetTitle>Title</SheetTitle>
      <SheetDescription>Body</SheetDescription>
    </SheetContent>
  </Sheet>
);

const confirm = (
  <ConfirmDialog
    open
    onOpenChange={vi.fn()}
    trigger={<button type="button">Open</button>}
    title="Delete?"
    onConfirm={vi.fn()}
  />
);

describe("shared UI text", () => {
  it.each([
    ["en", "Close"],
    ["pt-BR", "Fechar"],
  ] as const)("dialog close names under %s: %s", (locale, close) => {
    inLocale(locale, openDialog);
    // The corner X (sr-only) and the footer button.
    expect(screen.getAllByRole("button", { name: close })).toHaveLength(2);
  });

  it.each([
    ["en", "Close"],
    ["pt-BR", "Fechar"],
  ] as const)("sheet close name under %s: %s", (locale, close) => {
    inLocale(locale, openSheet);
    expect(screen.getByRole("button", { name: close })).toBeInTheDocument();
  });

  it.each([
    ["en", "Cancel", "Confirm"],
    ["pt-BR", "Cancelar", "Confirmar"],
  ] as const)(
    "confirm dialog default labels under %s",
    (locale, cancel, confirmLabel) => {
      inLocale(locale, confirm);
      expect(screen.getByRole("button", { name: cancel })).toBeVisible();
      expect(screen.getByRole("button", { name: confirmLabel })).toBeVisible();
    },
  );

  it("a caller's own confirm label still wins", () => {
    inLocale(
      "pt-BR",
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Open</button>}
        title="Excluir?"
        confirmLabel="Excluir"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Excluir" })).toBeVisible();
  });

  it.each([
    ["en", "4 out of 5 stars"],
    ["pt-BR", "4 de 5 estrelas"],
  ] as const)("star rating name under %s", (locale, name) => {
    inLocale(locale, <StarRating rating={4.2} />);
    expect(screen.getByLabelText(name)).toBeInTheDocument();
  });

  it.each([
    ["en", "Command Palette"],
    ["pt-BR", "Paleta de comandos"],
  ] as const)("command palette title under %s", (locale, title) => {
    inLocale(locale, <CommandDialog open>{null}</CommandDialog>);
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it.each([
    [
      "en",
      "Go to the Previous Month",
      "Go to the Next Month",
      "Navigation bar",
    ],
    [
      "pt-BR",
      "Ir para o mês anterior",
      "Ir para o próximo mês",
      "Barra de navegação",
    ],
  ] as const)(
    "calendar navigation names under %s",
    (locale, previous, next, nav) => {
      inLocale(locale, <Calendar mode="single" month={new Date(2026, 9, 1)} />);
      expect(screen.getByRole("button", { name: previous })).toBeVisible();
      expect(screen.getByRole("button", { name: next })).toBeVisible();
      expect(screen.getByRole("navigation", { name: nav })).toBeVisible();
    },
  );

  it.each([
    ["en", /^Notifications/],
    ["pt-BR", /^Notificações/],
  ] as const)("toast region name under %s", (locale, name) => {
    inLocale(locale, <Toaster />);
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  });
});
