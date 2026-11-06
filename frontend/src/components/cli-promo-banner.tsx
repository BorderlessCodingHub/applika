"use client";

import { useState, useSyncExternalStore } from "react";
import { Terminal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "applika.cli-banner-dismissed";
const STORAGE_EVENT = "applika:cli-banner-dismissed";
const PYPI_URL = "https://pypi.org/project/applika-cli/";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

const getServerSnapshot = (): boolean => true;

export function CliPromoBanner() {
  const t = useTranslations("cliBanner");
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [closedThisSession, setClosedThisSession] = useState(false);

  if (dismissed || closedThisSession) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      setClosedThisSession(true);
    }
  };

  return (
    <div
      role="region"
      aria-label={t("region")}
      // Below sm the CTA drops under the copy: beside it the copy column was ~60px wide.
      className={cn(
        "mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm",
        "sm:flex sm:gap-4 sm:p-4",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Terminal className="size-4" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <p className="leading-tight font-medium">
          {t.rich("title", {
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
        <p className="text-xs text-muted-foreground sm:text-sm">{t("body")}</p>
      </div>

      <Button
        asChild
        size="sm"
        variant="default"
        className="col-start-2 row-start-2 shrink-0 justify-self-start"
      >
        <a href={PYPI_URL} target="_blank" rel="noopener noreferrer">
          {t("cta")}
        </a>
      </Button>

      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className={cn(
          "col-start-3 row-start-1 shrink-0 self-start rounded-md p-1 text-muted-foreground transition-colors sm:self-auto",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
