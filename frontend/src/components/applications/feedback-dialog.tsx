"use client";

import { useState } from "react";
import { MessageSquareHeart, Star, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { services } from "@/services/services";
import { rateLimitNotice } from "@/lib/rate-limit";
import { FeedbackScore } from "@/services/types/feedbacks";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("feedback");

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="ghost">
        <MessageSquareHeart className="h-4 w-4" />
        <span className="font-display">{t("button")}</span>
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const MAX_TEXT_LENGHT = 2000;

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("feedback");
  const [rate, setRate] = useState<FeedbackScore | 0>(0);
  const [hovered, setHovered] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const reset = () => {
    setRate(0);
    setHovered(0);
    setFeedback("");
  };

  const handleSubmit = async () => {
    if (rate === 0) {
      toast.error(t("pickRating"));
      return;
    }
    setPending(true);
    try {
      await services.feedbacks.create({ score: rate, text: feedback });
      toast.success(t("thanks"));
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(rateLimitNotice(error) ?? t("failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRate(n as FeedbackScore)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  "h-8 w-8 transition-colors",
                  n <= (hovered || rate)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>

        <div className="">
          <Textarea
            placeholder={t("placeholder")}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={MAX_TEXT_LENGHT}
            className="resize-none"
          />
          <span className="font-numeric text-xs text-muted-foreground">
            {t("charactersLeft", { count: MAX_TEXT_LENGHT - feedback.length })}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
