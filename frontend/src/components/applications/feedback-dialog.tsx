"use client";

import { useState } from "react";
import { MessageSquareHeart, Star, Loader2 } from "lucide-react";
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
import { FeedbackScore } from "@/services/types/feedbacks";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="ghost">
        <MessageSquareHeart className="h-4 w-4" />
        <span className="font-display">Feedback</span>
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
      toast.error("Please select a rating");
      return;
    }
    setPending(true);
    try {
      await services.feedbacks.create({ score: rate, text: feedback });
      toast.success("Thanks for your feedback!");
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Failed to send feedback");
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
          <DialogTitle className="font-display">
            Rate your experience
          </DialogTitle>
          <DialogDescription>
            How are you enjoying Applika? Your feedback helps us improve.
          </DialogDescription>
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
            placeholder="Tell us what you think… (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={MAX_TEXT_LENGHT}
            className="resize-none"
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {`${MAX_TEXT_LENGHT - feedback.length} characters`}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
