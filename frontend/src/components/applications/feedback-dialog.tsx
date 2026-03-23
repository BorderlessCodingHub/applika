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
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
      >
        <MessageSquareHeart className="h-4 w-4" />
        <span className="font-display">Feedback</span>
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rate, setRate] = useState(0);
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
      await api.post("/feedback", { rate, feedback });
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
              onClick={() => setRate(n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  "h-8 w-8 transition-colors",
                  n <= (hovered || rate)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </div>

        <Textarea
          placeholder="Tell us what you think… (optional)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          maxLength={2000}
          className="resize-none"
        />

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
