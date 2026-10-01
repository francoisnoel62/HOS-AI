// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateManifestKey, type JSONWebKeySet, verifyManifest } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import { mewsCapabilities } from "@/lib/hos/mappings/mews-sync";
import { producerManifest } from "@/lib/hos/producer/manifest";
import { publishManifest } from "@/lib/hos/producer/publish";

const manifest = producerManifest({ source: "urn:hos:pms:mews", tenant: "tenant_pilot", propertyId: "prop_pilot" }, mewsCapabilities, {
  retentionDays: 30,
});
const now = new Date("2026-10-01T09:00:00Z");
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), "utf8");

describe("Publishing the pilot producer's manifest", () => {
  it("writes the manifest, its signature and the key set, which a consumer verifies", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey({ kid: "pilot-2026-10" });
    const jwks: JSONWebKeySet = { keys: [publicJwk] };
    const dir = mkdtempSync(path.join(tmpdir(), "hos-publish-"));
    const published = await publishManifest(dir, manifest, { privateJwk, jwks, days: 7, now });
    expect(published).toEqual({
      kid: "pilot-2026-10",
      issuedAt: "2026-10-01T09:00:00.000Z",
      expiresAt: "2026-10-08T09:00:00.000Z",
      files: ["jwks.json", "manifest.json", "manifest.jws"],
    });
    const verified = await verifyManifest(JSON.parse(read(dir, "manifest.json")), read(dir, "manifest.jws"), JSON.parse(read(dir, "jwks.json")), {
      now,
    });
    expect(verified).toMatchObject({ valid: true, header: { kid: "pilot-2026-10" } });
    // Eight days on, the signature has expired: the producer signs again every day, well before.
    expect(await verifyManifest(manifest, read(dir, "manifest.jws"), jwks, { now: new Date("2026-10-09T09:00:00Z") })).toMatchObject({
      valid: false,
      error: "expired",
    });
  });

  it("signs again a day later without changing the manifest", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey();
    const jwks = { keys: [publicJwk] };
    const dir = mkdtempSync(path.join(tmpdir(), "hos-publish-"));
    await publishManifest(dir, manifest, { privateJwk, jwks, days: 7, now });
    const [first, signature] = [read(dir, "manifest.json"), read(dir, "manifest.jws")];
    await publishManifest(dir, manifest, { privateJwk, jwks, days: 7, now: new Date("2026-10-02T09:00:00Z") });
    expect(read(dir, "manifest.json")).toBe(first);
    expect(read(dir, "manifest.jws")).not.toBe(signature);
  });

  it("refuses to publish a key set with a private key, or without the signing key", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey({ kid: "signing" });
    const other = await generateManifestKey({ kid: "other" });
    const dir = mkdtempSync(path.join(tmpdir(), "hos-publish-"));
    await expect(publishManifest(dir, manifest, { privateJwk, jwks: { keys: [publicJwk, other.privateJwk] }, days: 7, now })).rejects.toThrow(
      "The key set holds a private key",
    );
    await expect(publishManifest(dir, manifest, { privateJwk, jwks: { keys: [other.publicJwk] }, days: 7, now })).rejects.toThrow(
      "The key set has no key signing",
    );
    await expect(publishManifest(dir, manifest, { privateJwk, jwks: { keys: [publicJwk] }, days: 0, now })).rejects.toThrow(
      "A signature lasts a positive number of days",
    );
  });
});
