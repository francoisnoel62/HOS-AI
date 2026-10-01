// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createFactWriter,
  createIdentityRegistry,
  generateManifestKey,
  type HosFact,
  type JSONWebKeySet,
  type JWK,
  type ProducerManifest,
  type StayCheckedIn,
  type UnitStatusChanged,
} from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { describe, expect, it } from "vitest";

import { loadTrustedManifests, type TrustedProducer } from "@/lib/hos/consumer/trust";
import { createMewsAdapter, type MewsResource } from "@/lib/hos/mappings/mews";
import { mewsCapabilities } from "@/lib/hos/mappings/mews-sync";
import { producerManifest } from "@/lib/hos/producer/manifest";
import { publishManifest } from "@/lib/hos/producer/publish";
import { mewsAdapterConfig, mewsDelivery, mewsRecording } from "@/tests/support/mews-recording";

const tenant = "tenant_pilot";
const [property] = mewsRecording.adapter.properties as Array<{ propertyId: string; timezone: string }>;
const pms = mewsRecording.adapter.source;
const mewsManifest = producerManifest({ source: pms, tenant, propertyId: property.propertyId }, mewsCapabilities, { retentionDays: 30 });
const now = new Date("2026-10-01T09:00:00Z");
const projection = { ready_housekeeping_statuses: ["clean", "inspected"] };

// A housekeeping app that reports room states for context: the PMS is their authority.
const housekeepingSource = "urn:hos:housekeeping:pilot-test";
const housekeepingManifest: ProducerManifest = {
  hosmanifestversion: "0.1",
  producer: housekeepingSource,
  name: "Housekeeping app (test)",
  organization: { name: "HOS AI test producer" },
  system_role: "housekeeping",
  property_ids: [property.propertyId],
  entities: ["Unit"],
  events: [{ type: "unit.status_changed", dimensions: ["housekeeping"], authoritative: false }],
  delivery: { mechanisms: ["webhook"], guarantee: "at-least-once", ordering: "none" },
  replay: { supported: false },
  retention: { event_days: 0 },
  limitations: ["A test producer: it reports room states the PMS is the authority for."],
};

// The facts of the recorded Mews deliveries, and of the housekeeping app about the same room.
const identities = createIdentityRegistry(mewsRecording.adapter.crosswalk);
const mews = createMewsAdapter(mewsAdapterConfig(tenant, identities));
const pmsFacts = mewsRecording.deliveries.flatMap((delivery) => mews.handle(mewsDelivery(delivery)).events);
const room = (mewsRecording.deliveries[2].fetched[0].response as { Resources: MewsResource[] }).Resources[0];
const unitId = identities.resolve("unit", room.Id);
const stayId = (pmsFacts.find((fact) => fact.type === "stay.expected")!.data as { stay_id: string }).stay_id;
const housekeeping = createFactWriter({
  source: housekeepingSource,
  tenant,
  propertyId: property.propertyId,
  timezone: property.timezone,
  recordedAt: "2026-07-30T09:00:00Z",
  idPrefix: "hk",
});
housekeeping.publish<UnitStatusChanged>("unit.status_changed", room.Id, "2026-07-30T09:00:00Z", [`unit:${unitId}`], {
  unit_id: unitId,
  dimension: "housekeeping",
  current: "dirty",
  authority_source: pms,
});
// Not something its manifest declares.
housekeeping.publish<StayCheckedIn>("stay.checked_in", room.Id, "2026-07-30T09:05:00Z", [`stay:${stayId}`, `unit:${unitId}`], {
  stay_id: stayId,
  unit_id: unitId,
});
const [observation, undeclared] = housekeeping.events;

// A producer's published directory, signed with privateJwk under the key set jwks.
async function published(manifest: ProducerManifest, privateJwk: JWK, jwks: JSONWebKeySet, at = now) {
  const dir = mkdtempSync(path.join(tmpdir(), "hos-trust-"));
  await publishManifest(dir, manifest, { privateJwk, jwks, days: 7, now: at });
  return dir;
}
const trusting = (dir: string, keys: JSONWebKeySet | string, producer = pms): TrustedProducer => ({
  producer,
  manifest: path.join(dir, "manifest.json"),
  keys,
});
const dispositions = (steps: ReturnType<typeof replayArrivalReadiness>, source: string) =>
  [...new Set(steps.filter((step) => step.event.source === source).map((step) => step.disposition))].sort();

describe("Consumer trust", () => {
  it("trusts a manifest signed with a key its configuration admits, from files or an authenticated HTTPS URL", async () => {
    const a = await generateManifestKey({ kid: "mews-a" });
    const dir = await published(mewsManifest, a.privateJwk, { keys: [a.publicJwk] });
    const fromFiles = await loadTrustedManifests({ producers: [trusting(dir, { keys: [a.publicJwk] })] }, { now });
    expect(fromFiles.verdicts).toEqual([{ producer: pms, trusted: true, kid: "mews-a", expiresAt: "2026-10-08T09:00:00.000Z" }]);
    expect(fromFiles.manifests).toEqual([mewsManifest]);

    // The same files behind a URL that needs a bearer token, which the configuration takes from the environment.
    const seen: Array<string | null> = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return new Response(readFileSync(path.join(dir, new URL(String(input)).pathname.split("/").at(-1)!), "utf8"));
    }) as typeof globalThis.fetch;
    const online = await loadTrustedManifests(
      {
        producers: [
          {
            producer: pms,
            manifest: "https://producer.test/.well-known/hos/manifest.json",
            keys: "https://keys.test/pilot/jwks.json",
            headers: { Authorization: "env:PILOT_TOKEN" },
          },
        ],
      },
      { now, fetch, env: { PILOT_TOKEN: "Bearer secret" } },
    );
    expect(online.verdicts).toMatchObject([{ trusted: true, kid: "mews-a" }]);
    expect(seen).toEqual(["Bearer secret", "Bearer secret", "Bearer secret"]);
  });

  it("counts as no manifest one altered, expired, signed by a key it does not admit, or another producer's", async () => {
    const a = await generateManifestKey({ kid: "mews-a" });
    const b = await generateManifestKey({ kid: "mews-b" });
    const dir = await published(mewsManifest, a.privateJwk, { keys: [a.publicJwk] });
    const verdict = async (trusted: TrustedProducer, at = now) => (await loadTrustedManifests({ producers: [trusted] }, { now: at })).verdicts[0];

    // The key set beside the manifest holds key a; the configuration admits key b only.
    expect(await verdict(trusting(dir, { keys: [b.publicJwk] }))).toMatchObject({ trusted: false, error: "unknown_key" });
    expect(await verdict(trusting(dir, path.join(dir, "jwks.json")), new Date("2026-10-09T09:00:00Z"))).toMatchObject({
      trusted: false,
      error: "expired",
    });
    expect(await verdict(trusting(dir, { keys: [a.publicJwk] }, "urn:hos:pms:apaleo"))).toMatchObject({ trusted: false, error: "other_producer" });
    expect(await verdict({ producer: pms, manifest: "http://producer.test/manifest.json", keys: { keys: [a.publicJwk] } })).toMatchObject({
      trusted: false,
      error: "unreadable",
      reason: "http://producer.test/manifest.json: a producer's files are read over HTTPS, never in clear.",
    });
    // A manifest that promises what HOS forbids fails before its signature is checked.
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...mewsManifest, delivery: { ...mewsManifest.delivery, guarantee: "exactly-once" } }),
    );
    expect(await verdict(trusting(dir, { keys: [a.publicJwk] }))).toMatchObject({ trusted: false, error: "invalid_manifest" });
    // Someone widens the manifest after it was signed.
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...mewsManifest, property_ids: [property.propertyId, "prop_other"] }));
    expect(await verdict(trusting(dir, { keys: [a.publicJwk] }))).toMatchObject({ trusted: false, error: "bad_signature" });

    await expect(loadTrustedManifests({ producers: [trusting(dir, { keys: [] }), trusting(dir, { keys: [] })] })).rejects.toThrow(
      `The trust configuration names ${pms} twice.`,
    );
  });

  it("processes the facts of trusted producers only, keeps a fact without authority as an observation, and refuses the undeclared", async () => {
    const pmsKey = await generateManifestKey({ kid: "mews-a" });
    const appKey = await generateManifestKey({ kid: "housekeeping-a" });
    const pmsDir = await published(mewsManifest, pmsKey.privateJwk, { keys: [pmsKey.publicJwk] });
    const appDir = await published(housekeepingManifest, appKey.privateJwk, { keys: [appKey.publicJwk] });
    const configuration = {
      producers: [trusting(pmsDir, { keys: [pmsKey.publicJwk] }), trusting(appDir, { keys: [appKey.publicJwk] }, housekeepingSource)],
    };
    const facts: HosFact[] = [...pmsFacts, observation, undeclared];

    const { manifests } = await loadTrustedManifests(configuration, { now });
    const steps = replayArrivalReadiness(facts, manifests, projection);
    expect(dispositions(steps, pms)).toEqual(["applied"]);
    expect(steps.find((step) => step.event.id === observation.id)?.disposition).toBe("non_authoritative");
    expect(steps.find((step) => step.event.id === undeclared.id)?.disposition).toBe("undeclared_capability");
    // The room's state is the PMS's: the app's dirty does not change it.
    const pmsOnly = replayArrivalReadiness(pmsFacts, manifests, projection).at(-1)!.stays[stayId];
    expect(steps.at(-1)!.stays[stayId]).toMatchObject({ readiness: pmsOnly.readiness, housekeeping: pmsOnly.housekeeping });

    // Once the PMS's manifest is altered, none of its facts is processed.
    writeFileSync(path.join(pmsDir, "manifest.json"), JSON.stringify({ ...mewsManifest, name: "Mews Connector API (widened)" }));
    const altered = await loadTrustedManifests(configuration, { now });
    expect(altered.verdicts.map((verdict) => verdict.trusted)).toEqual([false, true]);
    const untrusted = replayArrivalReadiness(facts, altered.manifests, projection);
    expect(dispositions(untrusted, pms)).toEqual(["undeclared_capability"]);
    expect(untrusted.at(-1)!.stays).toEqual({});
  });

  it("carries a key rotation, then the revocation of the old key", async () => {
    const a = await generateManifestKey({ kid: "mews-a" });
    const b = await generateManifestKey({ kid: "mews-b" });
    const trust = (dir: string, keys: JWK[]) => loadTrustedManifests({ producers: [trusting(dir, { keys })] }, { now });

    // Key a signs, and the consumer admits it.
    const dir = await published(mewsManifest, a.privateJwk, { keys: [a.publicJwk] });
    expect((await trust(dir, [a.publicJwk])).verdicts).toMatchObject([{ trusted: true, kid: "mews-a" }]);
    const signedByA = readFileSync(path.join(dir, "manifest.jws"), "utf8");

    // Rotation: the producer adds key b and signs with it; the consumer admits both keys meanwhile.
    await publishManifest(dir, mewsManifest, { privateJwk: b.privateJwk, jwks: { keys: [a.publicJwk, b.publicJwk] }, days: 7, now });
    expect((await trust(dir, [a.publicJwk, b.publicJwk])).verdicts).toMatchObject([{ trusted: true, kid: "mews-b" }]);
    const signedByB = readFileSync(path.join(dir, "manifest.jws"), "utf8");
    writeFileSync(path.join(dir, "manifest.jws"), signedByA);
    expect((await trust(dir, [a.publicJwk, b.publicJwk])).verdicts).toMatchObject([{ trusted: true, kid: "mews-a" }]);

    // Revocation: key a may be exposed, so the consumer admits key b only. What a signs fails, a widened manifest too.
    expect((await trust(dir, [b.publicJwk])).verdicts).toMatchObject([{ trusted: false, error: "unknown_key" }]);
    const widened = { ...mewsManifest, property_ids: [property.propertyId, "prop_other"] };
    await publishManifest(dir, widened, { privateJwk: a.privateJwk, jwks: { keys: [a.publicJwk] }, days: 7, now });
    const forged = await trust(dir, [b.publicJwk]);
    expect(forged.verdicts).toMatchObject([{ trusted: false, error: "unknown_key" }]);
    expect(dispositions(replayArrivalReadiness(pmsFacts, forged.manifests, projection), pms)).toEqual(["undeclared_capability"]);

    // The producer's own signature with b still passes.
    writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(mewsManifest, null, 2)}\n`);
    writeFileSync(path.join(dir, "manifest.jws"), signedByB);
    expect((await trust(dir, [b.publicJwk])).verdicts).toMatchObject([{ trusted: true, kid: "mews-b" }]);
  });
});
