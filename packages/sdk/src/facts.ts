import { localDate, utc } from "./time.ts";
import type { HosFact } from "./types.generated.ts";

// Creating HOS facts from a source system: opaque identities, and the HOS envelope around each fact.

// actor ids become the pseudonymous references of hosactor.
export type HosEntityKind = "reservation" | "stay" | "unit" | "guest" | "maintenance" | "actor";
export type IdentityRegistry = { resolve(kind: HosEntityKind, sourceId: string): string };
export type Crosswalk = Partial<Record<HosEntityKind, Record<string, string>>>;

// HOS ids are opaque and must survive a migration of the source system, so they are never the source system's own ids.
// An integration persists this crosswalk; an id it has not seen yet gets a fresh opaque id.
export function createIdentityRegistry(crosswalk: Crosswalk = {}, mint = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16)): IdentityRegistry {
  const known = new Map<string, string>();
  for (const [kind, ids] of Object.entries(crosswalk)) for (const [sourceId, hosId] of Object.entries(ids ?? {})) known.set(`${kind}|${sourceId}`, hosId);
  return {
    resolve(kind, sourceId) {
      const key = `${kind}|${sourceId}`;
      if (!known.has(key)) known.set(key, `${kind}_${mint()}`);
      return known.get(key)!;
    },
  };
}

export type FactContext = { source: string; tenant: string; propertyId: string; timezone: string; recordedAt: string; idPrefix: string };

// businessDate overrides the local date of time. timeBasis qualifies a time the source system did not give as the moment
// of the change: modified when it is the entity's last modification, recorded when the source gave none, in which case
// time is when the adapter recorded the fact, as HOS Events requires. actor is the hosactor of the change, when known.
export type FactOptions = { businessDate?: string; timeBasis?: "modified" | "recorded"; actor?: string };

// Collects the HOS facts of one delivery from a source system. The id is derived from the source's key, the HOS type and
// the source's own time for the event, so a redelivered source event, or a restarted adapter, publishes the same id and
// HOS discards the duplicate.
export function createFactWriter(context: FactContext) {
  const events: HosFact[] = [];
  function publish<T extends HosFact>(type: T["type"], key: string, time: string, subjects: string[], data: T["data"], { businessDate, timeBasis, actor }: FactOptions = {}) {
    const occurred = utc(timeBasis === "recorded" ? context.recordedAt : time);
    events.push({
      specversion: "1.0",
      id: `${context.idPrefix}:${key}:${type}:${utc(time).replace(/[-:]/g, "")}`,
      source: context.source,
      type,
      time: occurred,
      datacontenttype: "application/json",
      hosschemaversion: "0.1",
      hosrecordedat: utc(context.recordedAt),
      ...(timeBasis ? { hostimebasis: timeBasis } : {}),
      hostenant: context.tenant,
      hosproperty: context.propertyId,
      hospropertytimezone: context.timezone,
      hosbusinessdate: businessDate ?? localDate(occurred, context.timezone),
      hossubjects: subjects.join(" "),
      ...(actor ? { hosactor: actor } : {}),
      data,
    } as T);
  }
  return { events, publish };
}
