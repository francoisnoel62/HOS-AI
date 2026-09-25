import type { Disposition } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

// Shared by the experimental PMS mappings: identities, time handling, the HOS envelope, and the recording format that
// replays a PMS's own payloads through its adapter.

export type HosEntityKind = "reservation" | "stay" | "unit" | "guest";
export type IdentityRegistry = { resolve(kind: HosEntityKind, pmsId: string): string };
export type Crosswalk = Partial<Record<HosEntityKind, Record<string, string>>>;

// A PMS event, or part of one, that did not become a HOS fact, and why.
export type Unmapped = { event: string; id: string; reason: string };
export type MappingResult = { events: HosFact[]; unmapped: Unmapped[] };

// HOS ids are opaque and must survive a PMS migration, so they are never the PMS's own ids. An integration persists this
// crosswalk; an id it has not seen yet gets a fresh opaque id.
export function createIdentityRegistry(crosswalk: Crosswalk = {}, mint = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16)): IdentityRegistry {
  const known = new Map<string, string>();
  for (const [kind, ids] of Object.entries(crosswalk)) for (const [pmsId, hosId] of Object.entries(ids ?? {})) known.set(`${kind}|${pmsId}`, hosId);
  return {
    resolve(kind, pmsId) {
      const key = `${kind}|${pmsId}`;
      if (!known.has(key)) known.set(key, `${kind}_${mint()}`);
      return known.get(key)!;
    },
  };
}

// An instant as HOS writes it: UTC, with milliseconds only when there are any.
export function utc(value: string | number) {
  const iso = new Date(value).toISOString();
  return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}

function zonedParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  return (type: string) => parts.find((item) => item.type === type)!.value;
}

export function localDate(iso: string, timeZone: string) {
  const part = zonedParts(Date.parse(iso), timeZone);
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The UTC instant of a wall-clock time at the property, such as a 15:00 check-in on 30 July.
export function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const wall = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  const offset = (instant: number) => {
    const part = zonedParts(instant, timeZone);
    return Date.UTC(+part("year"), +part("month") - 1, +part("day"), +part("hour"), +part("minute"), +part("second")) - instant;
  };
  // A second pass settles instants next to a daylight-saving change.
  const first = wall - offset(wall);
  return utc(wall - offset(first));
}

export type FactContext = { source: string; tenant: string; propertyId: string; timezone: string; recordedAt: string; idPrefix: string };

// businessDate overrides the local date of time. recorded marks a fact the PMS did not date: its time is then when the
// adapter recorded it, as HOS Events requires.
export type FactOptions = { businessDate?: string; recorded?: boolean };

// Collects the HOS facts of one PMS delivery. The id is derived from the PMS key, the HOS type and the PMS's own time for
// the event, so a redelivered PMS event, or a restarted adapter, publishes the same id and HOS discards the duplicate.
export function createFactWriter(context: FactContext) {
  const events: HosFact[] = [];
  function publish<T extends HosFact>(type: T["type"], key: string, time: string, subjects: string[], data: T["data"], { businessDate, recorded }: FactOptions = {}) {
    const occurred = utc(recorded ? context.recordedAt : time);
    events.push({
      specversion: "1.0",
      id: `${context.idPrefix}:${key}:${type}:${utc(time).replace(/[-:]/g, "")}`,
      source: context.source,
      type,
      time: occurred,
      datacontenttype: "application/json",
      hosschemaversion: "0.1",
      hosrecordedat: utc(context.recordedAt),
      ...(recorded ? { hostimebasis: "recorded" } : {}),
      hostenant: context.tenant,
      hosproperty: context.propertyId,
      hospropertytimezone: context.timezone,
      hosbusinessdate: businessDate ?? localDate(occurred, context.timezone),
      hossubjects: subjects.join(" "),
      data,
    } as T);
  }
  return { events, publish };
}

// --- Recordings: a PMS's payloads for the arrival-readiness scenario, replayed through its adapter ---

export type RecordedCall = { operation: string; request: Record<string, unknown>; response: unknown };

export type RecordedDelivery = {
  delivery: string;
  // The corpus delivery each mapped fact stands for, in order; null marks a fact the corpus does not have.
  reproduces: Array<number | null>;
  received_at: string;
  note: string;
  webhook: unknown;
  // Set when the webhook payload is reconstructed rather than taken from a published source.
  webhook_verification?: string;
  fetched: RecordedCall[];
};

export type MappingSource = { label: string; url: string; revision?: string; official: boolean; covers: string };

export type MappingRecording = {
  mapping: string;
  pms: string;
  hosschemaversion: "0.1";
  status: "experimental";
  title: string;
  summary: string;
  sources: MappingSource[];
  scenario: string;
  // The adapter's configuration, specific to each PMS, and the id crosswalk.
  adapter: { source: string; tenant: string; properties: unknown[]; crosswalk: Crosswalk };
  identity: string;
  deliveries: RecordedDelivery[];
  not_reproduced: Array<{ delivery: number; reason: string }>;
  differences: Array<{ delivery: number; field: string; reason: string }>;
  additions: Array<{ delivery: string; type: string; disposition: Disposition; reason: string }>;
};

export type RecordingAdapter = (delivery: RecordedDelivery) => MappingResult;

export const responses = <T>(delivery: RecordedDelivery) => delivery.fetched.map((call) => call.response as T);
