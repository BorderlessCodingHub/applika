import { cn } from "@/lib/utils";
import { useEffect } from "react";
import {Button} from "@/components/ui/Button";
import { FlashCategory } from "../hooks/userProfile";

export default function FlashMessage({
  category,
  message,
  onClose,
}: {
  category: FlashCategory;
  message: string;
  onClose: () => void;
}) {
  // Auto-hide after 5s
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const categoryStyles: Record<FlashCategory, string> = {
    error: "bg-red-500/20 border border-red-500/50 text-red-400",
    success: "bg-green-500/20 border border-green-500/50 text-green-400",
    warning: "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400",
  };

  return (
    <div
      className={cn(
        "rounded-lg p-4 flex justify-between items-center mb-4",
        categoryStyles[category]
      )}
    >
      <span>{message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="text-white/70 hover:text-white"
      >
        ✕
      </Button>
    </div>
  );
}
