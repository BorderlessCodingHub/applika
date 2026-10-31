"use client";

import { useLocale } from "next-intl";

import { useMemo, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon } from "lucide-react";

import { TIMEZONE_COPY } from "@/components/timeline/timeline-copy";
import {
  groupTimeZones,
  timeZoneFilter,
  timeZoneLabel,
  timeZoneOffset,
} from "@/components/timeline/timezone-options";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TimezoneSelectProps {
  /** IANA id. `""` shows the placeholder; an id the browser does not list is still shown. */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Trigger id; `<FormControl>` passes the one its `<FormLabel>` points at. */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Searchable single-choice picker over `Intl.supportedValuesOf("timeZone")`,
 * grouped by region, each zone with its current UTC offset. Not clearable: a
 * schedule without a zone is the times left blank. Controlled + presentational.
 */
export function TimezoneSelect({
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const offset = useMemo(() => (value ? timeZoneOffset(value) : null), [value]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    // `modal`: a non-modal popover inside the Dialog cannot scroll — the Dialog's scroll lock eats the wheel.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id={id}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-label={ariaLabelledby ? undefined : TIMEZONE_COPY.label}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "w-full min-w-0 justify-between gap-2 bg-card px-3 font-normal",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <GlobeIcon aria-hidden className="text-muted-foreground" />
            <span
              data-slot="timezone-select-value"
              className={cn("truncate", !value && "text-muted-foreground")}
            >
              {value ? timeZoneLabel(value) : TIMEZONE_COPY.placeholder}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {offset ? (
              <span className="font-numeric text-xs text-muted-foreground">
                <span className="sr-only">, </span>
                {offset}
              </span>
            ) : null}
            <ChevronsUpDownIcon aria-hidden className="opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={TIMEZONE_COPY.label}
        className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-64 flex-col p-0"
      >
        <TimezoneOptions
          value={value}
          onSelect={(zone) => {
            onValueChange(zone);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TimezoneOptions({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (zone: string) => void;
}) {
  // Mounted only while open: the ~420 offsets are computed on first open, then cached.
  // The headings follow the language: regroup on a switch.
  const locale = useLocale();
  const groups = useMemo(
    () => groupTimeZones(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `locale` re-reads the headings
    [value, locale],
  );

  return (
    // `label`, not `aria-label` on the input: cmdk points the input's `aria-labelledby` at its own label.
    <Command
      label={TIMEZONE_COPY.search}
      defaultValue={value}
      filter={timeZoneFilter}
      loop
      className="min-h-0"
    >
      <CommandInput
        placeholder={TIMEZONE_COPY.search}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="search"
        // 16px below md: iOS zooms the page into a smaller focused input.
        className="text-base md:text-sm"
        onKeyDown={(event) => {
          if (event.key === "Home" || event.key === "End") {
            event.stopPropagation();
          }
        }}
      />
      <CommandList className="max-h-72 min-h-0 overscroll-contain">
        <CommandEmpty>{TIMEZONE_COPY.empty}</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup
            key={group.options[0]?.value ?? group.heading}
            heading={group.heading}
          >
            {group.options.map((option) => {
              const selected = option.value === value;
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={option.keywords}
                  data-checked={selected}
                  onSelect={() => onSelect(option.value)}
                >
                  <CheckIcon
                    aria-hidden
                    className={cn(
                      "text-foreground",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {option.offset ? (
                    <span className="shrink-0 font-numeric text-xs text-muted-foreground">
                      <span className="sr-only">, </span>
                      {option.offset}
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
