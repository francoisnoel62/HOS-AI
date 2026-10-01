import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type JSONWebKeySet, type JWK, type ProducerManifest, signManifest, verifyManifest } from "@hos-ai/sdk";

// Signing and publishing the manifest of the pilot's producer (FO-03 of FINISH-OBSERVE), as HOS Events 0.1 specifies:
// the manifest, its detached signature and the producer's public keys, written as manifest.json, manifest.jws and
// jwks.json in one directory. A public producer serves that directory at /.well-known/hos/ on its HTTPS origin; a
// private one gives its consumers the three files through authenticated URLs. HOS 0.1 signs the manifest, not each
// event, as decided in FO-00.

export type Publication = { kid: string; issuedAt: string; expiresAt: string; files: string[] };

export async function publishManifest(
  dir: string,
  manifest: ProducerManifest,
  { privateJwk, jwks, days, now = new Date() }: { privateJwk: JWK; jwks: JSONWebKeySet; days: number; now?: Date },
): Promise<Publication> {
  if (!(days > 0)) throw new RangeError(`A signature lasts a positive number of days: ${days}.`);
  // The key set is published as it is: it holds the signing key's public half, and no private key.
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  if (keys.some((key) => "d" in key))
    throw new Error("The key set holds a private key, and it is published: keep only public keys in it, and replace that key.");
  if (!keys.some((key) => key.kid === privateJwk.kid))
    throw new Error(`The key set has no key ${privateJwk.kid}: add the signing key's public half to it before publishing.`);

  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const jws = await signManifest(manifest, privateJwk, { issuedAt: now, expiresAt });
  // What a consumer checks, checked first, so the producer never publishes a manifest that fails.
  const verified = await verifyManifest(manifest, jws, jwks, { now });
  if (!verified.valid) throw new Error(`The signed manifest does not verify with the key set: ${verified.message}`);

  mkdirSync(dir, { recursive: true });
  // The key set first, then the manifest, then its signature. A consumer that reads between two writes finds a
  // signature that does not match yet, treats the manifest as missing for that read, and succeeds on the next.
  const files = [
    ["jwks.json", `${JSON.stringify(jwks, null, 2)}\n`],
    ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["manifest.jws", `${jws}\n`],
  ] as const;
  for (const [name, content] of files) writeFileSync(path.join(dir, name), content);
  return { kid: verified.header.kid, issuedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), files: files.map(([name]) => name) };
}
