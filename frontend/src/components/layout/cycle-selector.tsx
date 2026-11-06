"use client";

import { useState } from "react";
import { Plus, History } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectButton,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCycleContext } from "@/contexts/cycle-context";
import { useCycles, useCreateCycle } from "@/hooks/use-cycles";
import { useGeneralStats } from "@/hooks/use-statistics";
import { cn } from "@/lib/utils";

const MIN_APPLICATIONS_FOR_CYCLE = 10;

export function CycleSelector({ className }: { className?: string }) {
  const t = useTranslations("cycleSelector");
  const { selectedCycleId, setSelectedCycleId } = useCycleContext();
  const { data: cycles } = useCycles();
  const { data: stats } = useGeneralStats();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cycleName, setCycleName] = useState("");

  const createCycle = useCreateCycle({
    onSuccess: () => {
      setDialogOpen(false);
      setCycleName("");
      setSelectedCycleId(null);
    },
  });

  const currentApps = stats?.total_applications ?? 0;
  const canCreateCycle = currentApps >= MIN_APPLICATIONS_FOR_CYCLE;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleName.trim()) return;
    createCycle.mutate({ name: cycleName.trim() });
  }

  return (
    <>
      <div
        className={cn("flex w-full items-center gap-2 lg:max-w-96", className)}
      >
        <Select
          value={selectedCycleId ?? "current"}
          onValueChange={(v) => setSelectedCycleId(v === "current" ? null : v)}
        >
          <SelectTrigger className="mx-auto">
            <History className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{t("current")}</SelectItem>
            {(cycles || []).map((cycle) => (
              <SelectItem key={cycle.id} value={cycle.id}>
                {cycle.name}
              </SelectItem>
            ))}
            {canCreateCycle && (
              <SelectButton
                className="w-full gap-1.5"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t("new")}
              </SelectButton>
            )}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t("dialogTitle")}</DialogTitle>
              <DialogDescription className="text-justify">
                {t("dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Input
                placeholder={t("namePlaceholder")}
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!cycleName.trim() || createCycle.isPending}
              >
                {createCycle.isPending ? t("creating") : t("start")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
