import { type ComponentType } from "react";
import { type LucideProps } from "lucide-react";

import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ApplicationIconActionTone = "default" | "warning" | "destructive";

const TONE_CLASS: Record<ApplicationIconActionTone, string> = {
  default: "text-muted-foreground hover:text-foreground",
  warning: "text-warning hover:text-warning",
  destructive: "text-destructive hover:text-destructive",
};

const BASE_CLASS = "[&_svg:not([class*='size-'])]:size-5";

interface ApplicationIconActionBaseProps {
  icon: ComponentType<LucideProps>;
  /** Accessible name, e.g. "Edit Backend engineer at Acme". */
  label: string;
  /** Tooltip word, e.g. "Edit". */
  title: string;
  tone?: ApplicationIconActionTone;
  className?: string;
}

type ApplicationIconActionProps = ApplicationIconActionBaseProps &
  (
    | { href: string; onClick?: never; disabled?: never }
    | { href?: undefined; onClick: () => void; disabled?: boolean }
  );

export function ApplicationIconAction({
  icon: Icon,
  label,
  title,
  tone = "default",
  className,
  ...props
}: ApplicationIconActionProps) {
  const classes = cn(BASE_CLASS, TONE_CLASS[tone], className);

  if (props.href != null) {
    return (
      <LinkButton
        href={props.href}
        variant="ghost"
        size="icon-lg"
        aria-label={label}
        title={title}
        className={classes}
      >
        <Icon aria-hidden />
      </LinkButton>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      title={title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={classes}
    >
      <Icon aria-hidden />
    </Button>
  );
}
