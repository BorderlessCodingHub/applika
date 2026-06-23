"use client";

import { useState, useSyncExternalStore } from "react";
import { Terminal, X } from "lucide-react";
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
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
      aria-label="applika-cli announcement"
      className={cn(
        "mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm",
        "sm:gap-4 sm:p-4",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Terminal className="size-4" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">
          Try the <span className="font-mono">applika-cli</span> command-line tool
        </p>
        <p className="text-xs text-muted-foreground sm:text-sm">
          A CLI to log applications from your terminal. Ships with a ready-to-use skill for AI
          tools like Claude and Codex. See PyPI for installation and full details.
        </p>
      </div>

      <Button asChild size="sm" variant="default" className="shrink-0">
        <a href={PYPI_URL} target="_blank" rel="noopener noreferrer">
          View on PyPI
        </a>
      </Button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className={cn(
          "shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
