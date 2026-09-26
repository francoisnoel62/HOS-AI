import { mkdirSync, writeFileSync } from "node:fs";

import { base64url, type JWK } from "jose";

import { canonicalize, generateManifestKey, type ProducerManifest, signManifest } from "../src/index.ts";

// Writes the signing test vectors in public/spec/0.1/conformance/signing, and the files a fictional producer serves
// under /.well-known/hos/. Each run draws new keys, so every file changes: run it again only when the manifest schema
// changes, with npm run signing-vectors -w @hos-ai/sdk. The tests check each vector against its expected verdict.

const directory = new URL("../../../public/spec/0.1/conformance/signing/", import.meta.url);

// A fictional producer on a domain reserved for examples (RFC 2606), never a real PMS.
const manifest: ProducerManifest = {
  hosmanifestversion: "0.1",
  producer: "https://housekeeping.example",
  name: "Example Housekeeping",
  organization: { name: "Example Housekeeping (fictional)", url: "https://housekeeping.example" },
  system_role: "housekeeping",
  property_ids: ["prop_demo"],
  entities: ["Unit", "Task"],
  events: [
    { type: "unit.status_changed", dimensions: ["housekeeping"], authoritative: true, snapshot: true },
    { type: "unit.status_changed", dimensions: ["occupancy"], authoritative: false, snapshot: true, note: "Occupancy is reported for context; the PMS is the authority." },
    { type: "housekeeping.task.created", authoritative: true },
    { type: "housekeeping.task.completed", authoritative: true },
  ],
  delivery: { mechanisms: ["webhook"], guarantee: "at-least-once", ordering: "none" },
  replay: { supported: true, window_days: 30, format: "jsonl" },
  retention: { event_days: 30 },
  limitations: ["A fictional producer, published to show a signed manifest. It emits no events."],
};

const at = "2026-11-01T00:00:00Z";
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const publicKeys = (...keys: JWK[]) => ({ keys });

const ed25519 = await generateManifestKey({ alg: "Ed25519" });
const es256 = await generateManifestKey({ alg: "ES256" });
const other = await generateManifestKey({ alg: "Ed25519" });

const current = { issuedAt: day("2026-10-01"), expiresAt: day("2026-12-30") };
const signed = await signManifest(manifest, ed25519.privateJwk, current);
const [header, , signature] = signed.split(".");
const headerOf = (fields: Record<string, unknown>) => base64url.encode(JSON.stringify(fields));

type Vector = { description: string; manifest: unknown; jws: string; jwks: { keys: JWK[] }; expected: { valid: true } | { valid: false; error: string } };

const vectors: Record<string, Vector> = {
  "valid-ed25519": {
    description: "A manifest signed with Ed25519, verified while its signature is valid.",
    manifest,
    jws: signed,
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: true },
  },
  "valid-es256": {
    description: "A manifest signed with ES256. The key set holds two keys; the kid picks the right one.",
    manifest,
    jws: await signManifest(manifest, es256.privateJwk, current),
    jwks: publicKeys(ed25519.publicJwk, es256.publicJwk),
    expected: { valid: true },
  },
  expired: {
    description: "The signature expired before the time of verification. The producer should have signed its manifest again.",
    manifest,
    jws: await signManifest(manifest, ed25519.privateJwk, { issuedAt: day("2026-07-01"), expiresAt: day("2026-09-29") }),
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "expired" },
  },
  "not-yet-valid": {
    description: "The signature is dated after the time of verification, beyond any clock skew.",
    manifest,
    jws: await signManifest(manifest, ed25519.privateJwk, { issuedAt: day("2026-11-15"), expiresAt: day("2027-02-13") }),
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "not_yet_valid" },
  },
  "wrong-key": {
    description: "Another key signed the manifest, under the kid of the producer's key.",
    manifest,
    jws: await signManifest(manifest, { ...other.privateJwk, kid: ed25519.publicJwk.kid }, current),
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "bad_signature" },
  },
  "modified-manifest": {
    description: "After signing, the manifest was changed to make its producer the authority for occupancy.",
    manifest: { ...manifest, events: manifest.events.map((declaration) => ({ ...declaration, authoritative: true })) },
    jws: signed,
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "bad_signature" },
  },
  "unknown-kid": {
    description: "No key in the key set has the kid of the signature: the key was removed, or belongs to someone else.",
    manifest,
    jws: signed,
    jwks: publicKeys(other.publicJwk),
    expected: { valid: false, error: "unknown_key" },
  },
  "alg-none": {
    description: "An unsigned JWS, alg none, that claims the producer's kid.",
    manifest,
    jws: `${headerOf({ alg: "none", kid: ed25519.publicJwk.kid, iat: Date.parse("2026-10-01T00:00:00Z") / 1000, exp: Date.parse("2026-12-30T00:00:00Z") / 1000 })}..`,
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "unsupported_algorithm" },
  },
  "attached-payload": {
    description: "A compact JWS that carries the manifest as its payload. A manifest signature is detached: its middle part is empty.",
    manifest,
    jws: `${header}.${base64url.encode(canonicalize(manifest))}.${signature}`,
    jwks: publicKeys(ed25519.publicJwk),
    expected: { valid: false, error: "malformed" },
  },
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
mkdirSync(directory, { recursive: true });
for (const [name, { description, ...vector }] of Object.entries(vectors)) {
  writeFileSync(new URL(`${name}.json`, directory), json({ description, rule: "events/signed-manifests", at, ...vector }));
}

// What https://housekeeping.example serves under /.well-known/hos/: its manifest, the manifest's signature and its keys.
const wellKnown = new URL("well-known/", directory);
const producerKey = await generateManifestKey({ alg: "Ed25519" });
mkdirSync(wellKnown, { recursive: true });
writeFileSync(new URL("manifest.json", wellKnown), json(manifest));
writeFileSync(new URL("manifest.jws", wellKnown), `${await signManifest(manifest, producerKey.privateJwk, { issuedAt: day("2026-09-26"), expiresAt: day("2027-09-26") })}\n`);
writeFileSync(new URL("jwks.json", wellKnown), json(publicKeys(producerKey.publicJwk)));

console.log(`Wrote ${Object.keys(vectors).length} vectors and the /.well-known/hos/ example in public/spec/0.1/conformance/signing`);
