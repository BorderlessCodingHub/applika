import { type ComponentType } from "react";
import { type LucideProps } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconTileVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-foreground/80",
        primary: "bg-primary/10 text-primary",
        info: "bg-info/15 text-info",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
      },
      size: {
        sm: "size-10 [&_svg]:size-5",
        md: "size-11 [&_svg]:size-5",
        lg: "size-12 [&_svg]:size-6",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "lg",
    },
  },
);

export type IconTileTone = NonNullable<
  VariantProps<typeof iconTileVariants>["tone"]
>;

export type IconTileSize = NonNullable<
  VariantProps<typeof iconTileVariants>["size"]
>;

interface IconTileProps {
  icon: ComponentType<LucideProps>;
  tone?: IconTileTone;
  size?: IconTileSize;
  className?: string;
}

export function IconTile({ icon: Icon, tone, size, className }: IconTileProps) {
  return (
    <span
      aria-hidden
      data-slot="icon-tile"
      className={cn(iconTileVariants({ tone, size }), className)}
    >
      <Icon />
    </span>
  );
}
