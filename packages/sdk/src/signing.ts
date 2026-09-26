import {
  base64url,
  CompactSign,
  calculateJwkThumbprint,
  compactVerify,
  errors,
  exportJWK,
  generateKeyPair,
  importJWK,
  type JSONWebKeySet,
  type JWK,
} from "jose";

import { canonicalize } from "./canonical.ts";
import type { ProducerManifest } from "./types.generated.ts";
import { validate } from "./validate.ts";

// Signed producer manifests, as HOS Events 0.1 specifies them. The manifest stays readable JSON and carries no signature.
// Its producer signs the manifest's canonical form (RFC 8785) with a JWS whose payload is detached (RFC 7515, appendix F),
// published beside it as manifest.jws, and publishes its public keys as a JWKS. The protected header names the key (kid)
// and says when the manifest was signed (iat) and when the signature expires (exp), in seconds since the epoch.

export type { JSONWebKeySet, JWK } from "jose";

export const manifestSignatureAlgorithms = ["Ed25519", "ES256"] as const;
export type ManifestSignatureAlgorithm = (typeof manifestSignatureAlgorithms)[number];

export type ManifestSignatureHeader = { alg: ManifestSignatureAlgorithm; kid: string; iat: number; exp: number };

// Why a signature fails:
// - malformed: not a detached compact JWS, or its header lacks kid, iat or exp, or uses crit or b64;
// - unsupported_algorithm: alg is neither Ed25519 nor ES256, none included;
// - unknown_key: no key in the key set has the kid, or two do;
// - unusable_key: the key cannot verify alg, is restricted to another use, or is private;
// - bad_signature: the manifest changed after it was signed, or another key signed it;
// - expired, not_yet_valid: exp has passed, or iat has not come, beyond the clock tolerance.
export type ManifestSignatureError =
  "malformed" | "unsupported_algorithm" | "unknown_key" | "unusable_key" | "bad_signature" | "expired" | "not_yet_valid";

export type ManifestVerification =
  | { valid: true; header: ManifestSignatureHeader; key: JWK }
  | { valid: false; error: ManifestSignatureError; message: string; header?: Record<string, unknown> };

// The key each algorithm takes.
const keyTypes: Record<ManifestSignatureAlgorithm, { kty: string; crv: string }> = {
  Ed25519: { kty: "OKP", crv: "Ed25519" },
  ES256: { kty: "EC", crv: "P-256" },
};
const algorithmOf = (jwk: JWK) => manifestSignatureAlgorithms.find((alg) => jwk.kty === keyTypes[alg].kty && jwk.crv === keyTypes[alg].crv);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Members in a readable order: the key's name and type first, then its material, then how it is used.
const memberOrder = ["kid", "kty", "crv", "x", "y", "d", "alg", "use"];
const tidy = (jwk: JWK): JWK =>
  Object.fromEntries(Object.entries(jwk).sort(([a], [b]) => (memberOrder.indexOf(a) + 1 || 99) - (memberOrder.indexOf(b) + 1 || 99)));

// A new signing key. kid defaults to the public key's thumbprint (RFC 7638), which names it uniquely in a key set.
export async function generateManifestKey({ alg = "Ed25519", kid }: { alg?: ManifestSignatureAlgorithm; kid?: string } = {}): Promise<{
  privateJwk: JWK;
  publicJwk: JWK;
}> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const use = { kid: kid ?? (await calculateJwkThumbprint(publicJwk)), alg, use: "sig" };
  return { privateJwk: tidy({ ...(await exportJWK(privateKey)), ...use }), publicJwk: tidy({ ...publicJwk, ...use }) };
}

// The detached JWS of a valid manifest, signed with a private key that has its kid: header..signature.
export async function signManifest(
  manifest: ProducerManifest,
  privateJwk: JWK,
  { issuedAt = new Date(), expiresAt }: { issuedAt?: Date; expiresAt: Date },
): Promise<string> {
  const checked = validate(manifest);
  if (checked.kind !== "manifest" || !checked.valid) {
    const [first] = checked.errors;
    throw new TypeError(`Only a valid producer manifest is signed${first ? `: ${first.path || "the manifest"} ${first.message}` : "."}`);
  }
  const alg = algorithmOf(privateJwk);
  if (!alg || typeof privateJwk.d !== "string") throw new TypeError("A manifest is signed with a private key: Ed25519 (kty OKP) or P-256 (kty EC).");
  if (privateJwk.alg && privateJwk.alg !== alg) throw new TypeError(`The key is for ${privateJwk.alg}, not ${alg}.`);
  if (!privateJwk.kid) throw new TypeError("The key has no kid. The kid names the key in the producer's key set, so a consumer can find it.");
  const iat = seconds(issuedAt);
  const exp = seconds(expiresAt);
  if (exp <= iat) throw new RangeError("The signature must expire after it is made.");

  const jws = await new CompactSign(encoder.encode(canonicalize(manifest)))
    .setProtectedHeader({ alg, kid: privateJwk.kid, iat, exp })
    .sign(await importJWK(privateJwk, alg));
  const [header, , signature] = jws.split(".");
  return `${header}..${signature}`;
}

// Verifies the detached JWS of a manifest with the producer's key set, at now. clockTolerance, in seconds, allows for
// clocks that disagree; HOS allows at most 60.
export async function verifyManifest(
  manifest: unknown,
  jws: string,
  jwks: JSONWebKeySet,
  { now = new Date(), clockTolerance = 60 }: { now?: Date; clockTolerance?: number } = {},
): Promise<ManifestVerification> {
  const fail = (error: ManifestSignatureError, message: string, header?: Record<string, unknown>): ManifestVerification => ({
    valid: false,
    error,
    message,
    ...(header ? { header } : {}),
  });

  const parts = jws.trim().split(".");
  if (parts.length !== 3)
    return fail("malformed", "This is not a compact JWS. A manifest signature has three parts, and the middle one is empty: header..signature.");
  const [encodedHeader, payload, signature] = parts;
  if (payload)
    return fail(
      "malformed",
      "The JWS carries a payload. A manifest signature is detached: its payload is the manifest itself, in canonical form, and its middle part is empty.",
    );
  let header: unknown;
  try {
    header = JSON.parse(decoder.decode(base64url.decode(encodedHeader)));
  } catch {
    header = undefined;
  }
  if (!isObject(header)) return fail("malformed", "The JWS header is not a JSON object encoded in base64url.");

  const alg = header.alg;
  if (!manifestSignatureAlgorithms.includes(alg as ManifestSignatureAlgorithm))
    return fail("unsupported_algorithm", `alg is ${JSON.stringify(alg ?? null)}. A manifest is signed with Ed25519 or ES256, never none.`, header);
  if ("crit" in header || "b64" in header)
    return fail(
      "malformed",
      "The header has crit or b64. A manifest signature uses neither: its payload is always the canonical manifest, base64url-encoded.",
      header,
    );
  if (typeof header.kid !== "string" || !header.kid)
    return fail("malformed", "The header has no kid. The kid names the signing key in the producer's key set.", header);
  for (const claim of ["iat", "exp"] as const) {
    if (!Number.isInteger(header[claim]))
      return fail(
        "malformed",
        `The header has no ${claim}, in whole seconds since the epoch. A manifest signature says when it was made and when it expires.`,
        header,
      );
  }
  const signed = header as ManifestSignatureHeader;
  if (signed.exp <= signed.iat) return fail("malformed", "exp is not after iat: the signature expires before it is made.", header);

  const keys = Array.isArray(jwks?.keys) ? jwks.keys.filter((key) => key.kid === signed.kid) : [];
  if (!keys.length)
    return fail(
      "unknown_key",
      `No key in the key set has kid ${signed.kid}. The key was removed, or the manifest was signed with another producer's key.`,
      header,
    );
  if (keys.length > 1) return fail("unknown_key", `The key set has ${keys.length} keys with kid ${signed.kid}. A kid names one key.`, header);
  const [jwk] = keys;
  if ("d" in jwk)
    return fail(
      "unusable_key",
      `Key ${signed.kid} is a private key. A key set publishes public keys only: this private key is exposed and must be replaced.`,
      header,
    );
  if (algorithmOf(jwk) !== signed.alg)
    return fail("unusable_key", `Key ${signed.kid} is ${[jwk.kty, jwk.crv].filter(Boolean).join(" ")}, which cannot verify ${signed.alg}.`, header);
  if ((jwk.alg && jwk.alg !== signed.alg) || (jwk.use && jwk.use !== "sig") || (jwk.key_ops && !jwk.key_ops.includes("verify")))
    return fail("unusable_key", `Key ${signed.kid} is restricted to another use (alg, use or key_ops).`, header);

  let canonical: string;
  try {
    canonical = canonicalize(manifest);
  } catch (error) {
    return fail("malformed", `The manifest has no canonical form: ${(error as Error).message}`, header);
  }
  let key: Awaited<ReturnType<typeof importJWK>>;
  try {
    key = await importJWK(jwk, signed.alg);
  } catch (error) {
    return fail("unusable_key", `Key ${signed.kid} cannot be read: ${(error as Error).message}`, header);
  }
  try {
    await compactVerify(`${encodedHeader}.${base64url.encode(canonical)}.${signature}`, key, { algorithms: [signed.alg] });
  } catch (error) {
    if (error instanceof errors.JWSSignatureVerificationFailed)
      return fail(
        "bad_signature",
        `The signature does not match this manifest and key ${signed.kid}: the manifest changed after it was signed, or another key signed it.`,
        header,
      );
    return fail("malformed", `The JWS cannot be verified: ${(error as Error).message}`, header);
  }

  const time = seconds(now);
  if (signed.exp <= time - clockTolerance)
    return fail(
      "expired",
      `The signature expired on ${new Date(signed.exp * 1000).toISOString()}. The producer signs its manifest again before it expires.`,
      header,
    );
  if (signed.iat > time + clockTolerance)
    return fail("not_yet_valid", `The signature is dated ${new Date(signed.iat * 1000).toISOString()}, in the future.`, header);
  return { valid: true, header: signed, key: jwk };
}
