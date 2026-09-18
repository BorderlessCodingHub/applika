import { TIMEZONE_COPY } from "@/components/timeline/timeline-copy";

/** Always offered, and the answer when the browser cannot name its own zone. */
export const FALLBACK_TIME_ZONE = "UTC";

export interface TimeZoneOption {
  /** The IANA id, exactly as stored and sent. */
  value: string;
  /** The id without its region, underscores as spaces: `Sao Paulo`. */
  label: string;
  /** e.g. `GMT-3`; `null` when the engine does not know the zone. */
  offset: string | null;
  /** Extra search terms beyond the id: the offset. */
  keywords: string[];
}

export interface TimeZoneGroup {
  heading: string;
  options: TimeZoneOption[];
}

let supportedCache: readonly string[] | null = null;
const offsetCache = new Map<string, string | null>();

/**
 * The browser's IANA zones plus `UTC`. Some engines omit `UTC` from
 * `Intl.supportedValuesOf`; a browser without it lists `UTC` alone.
 */
export function supportedTimeZones(): readonly string[] {
  if (supportedCache) return supportedCache;
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  supportedCache = zones.includes(FALLBACK_TIME_ZONE)
    ? zones
    : [...zones, FALLBACK_TIME_ZONE];
  return supportedCache;
}

/** The zone the browser runs in — the form's pre-fill. */
export function browserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE
    );
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/** `America/Sao_Paulo` -> `America/Sao Paulo`. */
export function timeZoneLabel(zone: string): string {
  return zone.replace(/_/g, " ");
}

/** Current UTC offset, e.g. `GMT-3`, `GMT+5:30`, `GMT`. `null` if unknown. */
export function timeZoneOffset(zone: string): string | null {
  const cached = offsetCache.get(zone);
  if (cached !== undefined) return cached;
  let offset: string | null = null;
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    offset = name ? (name === "GMT+0" ? "GMT" : name) : null;
  } catch {
    // RangeError: a stored id this engine does not know.
    offset = null;
  }
  offsetCache.set(zone, offset);
  return offset;
}

function toOption(zone: string, label: string): TimeZoneOption {
  const offset = timeZoneOffset(zone);
  return {
    value: zone,
    label,
    offset,
    keywords: offset ? [offset] : [],
  };
}

/**
 * The zones grouped by region in list order, `Other` (region-less, e.g. `UTC`)
 * last. A `selected` zone the list lacks leads in its own group, so a stored
 * legacy or `Etc/*` value is still shown and checked.
 */
export function groupTimeZones(selected: string): TimeZoneGroup[] {
  const zones = supportedTimeZones();
  const groups: TimeZoneGroup[] = [];
  const byRegion = new Map<string, TimeZoneGroup>();
  const other: TimeZoneGroup = {
    heading: TIMEZONE_COPY.otherGroup,
    options: [],
  };

  if (selected && !zones.includes(selected)) {
    groups.push({
      heading: TIMEZONE_COPY.selectedGroup,
      options: [toOption(selected, timeZoneLabel(selected))],
    });
  }

  for (const zone of zones) {
    const slash = zone.indexOf("/");
    if (slash === -1) {
      other.options.push(toOption(zone, timeZoneLabel(zone)));
      continue;
    }
    const region = zone.slice(0, slash);
    let group = byRegion.get(region);
    if (!group) {
      group = { heading: region, options: [] };
      byRegion.set(region, group);
      groups.push(group);
    }
    group.options.push(toOption(zone, timeZoneLabel(zone.slice(slash + 1))));
  }

  if (other.options.length > 0) groups.push(other);
  return groups;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/_/g, " ").trim();
}

/**
 * cmdk `filter`: case-insensitive substring over the id (underscores as
 * spaces) and the offset, never fuzzy — cmdk's default scorer matches "zzzz"
 * to Brazzaville. A match at a word start ranks first. `UTC-3` finds `GMT-3`.
 */
export function timeZoneFilter(
  value: string,
  search: string,
  keywords: string[] = [],
): number {
  const needle = normalize(search).replace(/^utc(?=[+-])/, "gmt");
  if (!needle) return 1;
  const haystack = normalize([value, ...keywords].join(" "));
  const index = haystack.indexOf(needle);
  if (index === -1) return 0;
  return index === 0 || /[\s/]/.test(haystack[index - 1]) ? 1 : 0.5;
}
