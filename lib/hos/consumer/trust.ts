import { readFile } from "node:fs/promises";

import { type JSONWebKeySet, type ManifestSignatureError, type ProducerManifest, validate, verifyManifest } from "@hos-ai/sdk";

// Trusting producers' manifests on the consumer side of the pilot (FO-03 of FINISH-OBSERVE). The consumer's trust
// configuration names each producer it admits, where to read its manifest and signature, and the keys it accepts for
// it. A producer's keys come from that configuration only: a key set published beside a manifest by a source the
// configuration does not name counts for nothing. As HOS Events 0.1 requires, a manifest that fails counts as no
// manifest: nothing it declares is processed, so the facts of that producer are undeclared capabilities.

export type TrustedProducer = {
  // The source the producer publishes under, which its manifest must name.
  producer: string;
  // Where to read its manifest: a file, or an HTTPS URL.
  manifest: string;
  // Where to read its signature; by default the manifest's location, ending in .jws instead of .json.
  signature?: string;
  // The keys accepted for it: a key set, or where to read one, a file or an HTTPS URL of an origin the operator trusts.
  keys: JSONWebKeySet | string;
  // Headers for authenticated URLs. A value env:NAME is read from the environment, so secrets stay out of the file.
  headers?: Record<string, string>;
};

export type TrustConfiguration = { producers: TrustedProducer[] };

export type ManifestVerdict =
  | { producer: string; trusted: true; kid: string; expiresAt: string }
  | { producer: string; trusted: false; error: ManifestSignatureError | "unreadable" | "invalid_manifest" | "other_producer"; reason: string };

type Options = { now?: Date; fetch?: typeof globalThis.fetch; env?: Record<string, string | undefined> };

const signatureBeside = (location: string) => (/\.json$/i.test(location) ? location.replace(/\.json$/i, ".jws") : `${location}.jws`);

async function read(location: string, headers: Record<string, string> | undefined, { fetch = globalThis.fetch, env = process.env }: Options) {
  if (/^http:\/\//i.test(location)) throw new Error(`${location}: a producer's files are read over HTTPS, never in clear.`);
  if (!/^https:\/\//i.test(location)) return readFile(location, "utf8");
  const resolved = Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => {
      if (!value.startsWith("env:")) return [name, value];
      const secret = env[value.slice(4)];
      if (secret === undefined) throw new Error(`${location}: the header ${name} names ${value.slice(4)}, which the environment does not set.`);
      return [name, secret];
    }),
  );
  const response = await fetch(location, { headers: resolved });
  if (!response.ok) throw new Error(`${location} answered ${response.status}.`);
  return response.text();
}

async function judge(trusted: TrustedProducer, options: Options): Promise<{ verdict: ManifestVerdict; manifest?: ProducerManifest }> {
  const { producer } = trusted;
  const refuse = (error: Exclude<ManifestVerdict, { trusted: true }>["error"], reason: string) => ({
    verdict: { producer, trusted: false as const, error, reason },
  });
  let manifest: unknown;
  let jws: string;
  let keys: JSONWebKeySet;
  try {
    manifest = JSON.parse(await read(trusted.manifest, trusted.headers, options));
    jws = await read(trusted.signature ?? signatureBeside(trusted.manifest), trusted.headers, options);
    keys = typeof trusted.keys === "string" ? (JSON.parse(await read(trusted.keys, trusted.headers, options)) as JSONWebKeySet) : trusted.keys;
  } catch (error) {
    return refuse("unreadable", error instanceof Error ? error.message : String(error));
  }
  const checked = validate(manifest);
  if (checked.kind !== "manifest" || !checked.valid)
    return refuse(
      "invalid_manifest",
      `The manifest fails the checks${checked.errors[0] ? `: ${checked.errors[0].path} ${checked.errors[0].message}` : "."}`,
    );
  const declared = manifest as ProducerManifest;
  if (declared.producer !== producer)
    return refuse("other_producer", `The manifest is ${declared.producer}'s, not ${producer}'s: it declares nothing for ${producer}.`);
  const signature = await verifyManifest(declared, jws, keys, { now: options.now });
  if (!signature.valid) return refuse(signature.error, signature.message);
  return {
    verdict: { producer, trusted: true, kid: signature.header.kid, expiresAt: new Date(signature.header.exp * 1000).toISOString() },
    manifest: declared,
  };
}

// The manifests a consumer may process facts under, now: those of the configured producers that pass, and a verdict
// for every configured producer.
export async function loadTrustedManifests(configuration: TrustConfiguration, options: Options = {}) {
  const producers = configuration.producers.map(({ producer }) => producer);
  const twice = producers.find((producer, index) => producers.indexOf(producer) !== index);
  if (twice) throw new Error(`The trust configuration names ${twice} twice.`);
  const judged = await Promise.all(configuration.producers.map((trusted) => judge(trusted, options)));
  return { manifests: judged.flatMap(({ manifest }) => (manifest ? [manifest] : [])), verdicts: judged.map(({ verdict }) => verdict) };
}
