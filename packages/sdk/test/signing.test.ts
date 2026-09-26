import { createPublicKey, verify } from "node:crypto";

import { base64url, CompactSign, importJWK, type JWK } from "jose";
import { describe, expect, it } from "vitest";

import { canonicalize, generateManifestKey, type ManifestSignatureAlgorithm, signManifest, validate, verifyManifest } from "../src/index.ts";
import { loadSigningVectors, loadWellKnownExample } from "./spec.ts";

// Signed producer manifests: the canonical form, the published test vectors and the example producer, then signing and
// verifying with keys drawn for each test.

const vectors = loadSigningVectors();
const example = loadWellKnownExample();
const manifest = example.manifest;

const issuedAt = new Date("2026-10-01T00:00:00Z");
const expiresAt = new Date("2026-12-30T00:00:00Z");
const now = new Date("2026-11-01T00:00:00Z");
const seconds = (date: Date) => date.getTime() / 1000;

// A detached JWS with any header, signed with jose directly, for headers signManifest never writes.
async function signWithHeader(header: Record<string, unknown>, privateJwk: JWK, payload = canonicalize(manifest)) {
  const jws = await new CompactSign(new TextEncoder().encode(payload))
    .setProtectedHeader(header as never)
    .sign(await importJWK(privateJwk, privateJwk.alg));
  const [encoded, , signature] = jws.split(".");
  return `${encoded}..${signature}`;
}

describe("canonicalize", () => {
  it("writes the example of RFC 8785", () => {
    const text =
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", "literals": [null, true, false]}';
    expect(canonicalize(JSON.parse(text))).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("sorts members by their UTF-16 code units", () => {
    const names = ["€", "\r", "דּ", "1", "😀", "\u0080", "ö"];
    const sorted = ["\r", "1", "\u0080", "ö", "€", "😀", "דּ"];
    expect(canonicalize(Object.fromEntries(names.map((name) => [name, 0])))).toBe(`{${sorted.map((name) => `${JSON.stringify(name)}:0`).join(",")}}`);
  });

  it("ignores spacing and member order", () => {
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    expect(canonicalize(JSON.parse(JSON.stringify(reordered, null, 4)))).toBe(canonicalize(manifest));
  });

  it("refuses what has no JSON form", () => {
    expect(() => canonicalize({ value: Number.NaN })).toThrow("NaN has no JSON form");
    expect(() => canonicalize(["\ud800"])).toThrow("lone surrogate");
    expect(() => canonicalize({ at: () => 0 })).toThrow("A function has no JSON form");
  });
});

describe("the signing test vectors", () => {
  it("cover each verdict the plan names", () => {
    expect(vectors.map((vector) => vector.file)).toEqual(
      expect.arrayContaining([
        "valid-ed25519.json",
        "valid-es256.json",
        "expired.json",
        "wrong-key.json",
        "modified-manifest.json",
        "unknown-kid.json",
        "alg-none.json",
      ]),
    );
    for (const vector of vectors) expect(validate(vector.manifest), vector.file).toMatchObject({ kind: "manifest", valid: true });
  });

  it.each(vectors.map((vector) => [vector.file, vector] as const))("%s gives its expected verdict", async (_, vector) => {
    const result = await verifyManifest(vector.manifest, vector.jws, vector.jwks, { now: new Date(vector.at) });
    expect(result.valid ? { valid: true } : { valid: false, error: result.error }).toEqual(vector.expected);
  });

  // Verifying without jose, as the specification describes it, shows the text is enough to implement it.
  it.each(vectors.filter((vector) => vector.expected.valid).map((vector) => [vector.file, vector] as const))(
    "%s verifies with node:crypto alone",
    (_, vector) => {
      const [encodedHeader, payload, signature] = vector.jws.split(".");
      expect(payload).toBe("");
      const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
      const jwk = vector.jwks.keys.find((key) => key.kid === header.kid)!;
      const input = Buffer.from(`${encodedHeader}.${Buffer.from(canonicalize(vector.manifest)).toString("base64url")}`);
      const key = createPublicKey({ key: jwk as never, format: "jwk" });
      const ok =
        header.alg === "ES256"
          ? verify("sha256", input, { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))
          : verify(null, input, key, Buffer.from(signature, "base64url"));
      expect(ok).toBe(true);
      expect(header.iat).toBeLessThanOrEqual(seconds(new Date(vector.at)));
      expect(header.exp).toBeGreaterThan(seconds(new Date(vector.at)));
    },
  );
});

describe("the /.well-known/hos/ example", () => {
  it("is a valid manifest, signed with the key its producer publishes", async () => {
    expect(validate(manifest)).toMatchObject({ kind: "manifest", valid: true });
    expect(example.jwks.keys.every((key) => !("d" in key))).toBe(true);
    const result = await verifyManifest(manifest, example.jws, example.jwks, { now: new Date("2026-10-01T00:00:00Z") });
    expect(result).toMatchObject({
      valid: true,
      header: {
        alg: "Ed25519",
        kid: example.jwks.keys[0].kid,
        iat: seconds(new Date("2026-09-26T00:00:00Z")),
        exp: seconds(new Date("2027-09-26T00:00:00Z")),
      },
    });
  });
});

describe("signManifest and verifyManifest", () => {
  it.each(["Ed25519", "ES256"] as ManifestSignatureAlgorithm[])("sign and verify with %s", async (alg) => {
    const { privateJwk, publicJwk } = await generateManifestKey({ alg });
    expect(publicJwk).toMatchObject({ alg, use: "sig", kid: expect.any(String) });
    expect(publicJwk).not.toHaveProperty("d");
    const jws = await signManifest(manifest, privateJwk, { issuedAt, expiresAt });
    expect(jws).toMatch(/^[\w-]+\.\.[\w-]+$/);
    const result = await verifyManifest(manifest, jws, { keys: [publicJwk] }, { now });
    expect(result).toEqual({ valid: true, header: { alg, kid: publicJwk.kid, iat: seconds(issuedAt), exp: seconds(expiresAt) }, key: publicJwk });
  });

  it("names the key by its thumbprint, or by the kid given", async () => {
    const { publicJwk } = await generateManifestKey({ kid: "2026-10" });
    expect(publicJwk.kid).toBe("2026-10");
    const thumbprinted = await generateManifestKey();
    expect(thumbprinted.publicJwk.kid).toMatch(/^[\w-]{43}$/);
  });

  it("allows 60 seconds of clock skew, and no more", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey();
    const jws = await signManifest(manifest, privateJwk, { issuedAt, expiresAt });
    const at = (date: Date, offset: number) =>
      verifyManifest(manifest, jws, { keys: [publicJwk] }, { now: new Date(date.getTime() + offset * 1000) });
    expect(await at(expiresAt, 59)).toMatchObject({ valid: true });
    expect(await at(expiresAt, 60)).toMatchObject({
      valid: false,
      error: "expired",
      message: "The signature expired on 2026-12-30T00:00:00.000Z. The producer signs its manifest again before it expires.",
    });
    expect(await at(issuedAt, -60)).toMatchObject({ valid: true });
    expect(await at(issuedAt, -61)).toMatchObject({ valid: false, error: "not_yet_valid" });
  });

  it("signs only a valid manifest, with a private key that has its kid", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey();
    await expect(signManifest({ ...manifest, limitations: [""] }, privateJwk, { expiresAt })).rejects.toThrow(
      "Only a valid producer manifest is signed: /limitations/0",
    );
    await expect(signManifest(manifest, publicJwk, { expiresAt })).rejects.toThrow("A manifest is signed with a private key");
    await expect(signManifest(manifest, { ...privateJwk, kid: undefined }, { expiresAt })).rejects.toThrow("The key has no kid");
    await expect(signManifest(manifest, privateJwk, { issuedAt: expiresAt, expiresAt })).rejects.toThrow("must expire after it is made");
  });

  it("refuses a header without kid, iat or exp, or with crit or b64", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey();
    const keys = { keys: [publicJwk] };
    const times = { iat: seconds(issuedAt), exp: seconds(expiresAt) };
    const verdict = async (header: Record<string, unknown>) => {
      const result = await verifyManifest(manifest, await signWithHeader({ alg: "Ed25519", ...header }, privateJwk), keys, { now });
      return result.valid ? "valid" : `${result.error}: ${result.message}`;
    };
    expect(await verdict({ ...times })).toBe("malformed: The header has no kid. The kid names the signing key in the producer's key set.");
    expect(await verdict({ kid: publicJwk.kid, iat: times.iat })).toMatch(/^malformed: The header has no exp/);
    expect(await verdict({ kid: publicJwk.kid, ...times, iat: "2026-10-01" })).toMatch(/^malformed: The header has no iat/);
    expect(await verdict({ kid: publicJwk.kid, iat: times.exp, exp: times.iat })).toBe(
      "malformed: exp is not after iat: the signature expires before it is made.",
    );
    expect(await verdict({ kid: publicJwk.kid, ...times, b64: true, crit: ["b64"] })).toMatch(/^malformed: The header has crit or b64/);
    expect(await verdict({ kid: publicJwk.kid, ...times, typ: "JOSE" })).toBe("valid");
  });

  it("refuses a key that cannot verify the signature", async () => {
    const { privateJwk, publicJwk } = await generateManifestKey();
    const jws = await signManifest(manifest, privateJwk, { issuedAt, expiresAt });
    const verdict = async (keys: JWK[]) => {
      const result = await verifyManifest(manifest, jws, { keys }, { now });
      return result.valid ? "valid" : `${result.error}: ${result.message}`;
    };
    const { publicJwk: ecKey } = await generateManifestKey({ alg: "ES256", kid: publicJwk.kid });
    expect(await verdict([ecKey])).toBe(`unusable_key: Key ${publicJwk.kid} is EC P-256, which cannot verify Ed25519.`);
    expect(await verdict([privateJwk])).toMatch(/^unusable_key: Key .* is a private key/);
    expect(await verdict([{ ...publicJwk, use: "enc" }])).toMatch(/restricted to another use/);
    expect(await verdict([{ ...publicJwk, key_ops: ["sign"] }])).toMatch(/restricted to another use/);
    expect(await verdict([publicJwk, { ...publicJwk }])).toBe(`unknown_key: The key set has 2 keys with kid ${publicJwk.kid}. A kid names one key.`);
    expect(await verdict([{ ...publicJwk, alg: undefined, use: undefined }])).toBe("valid");
  });

  it("refuses what is not a detached JWS", async () => {
    const keys = { keys: [] };
    const verdict = async (jws: string) => {
      const result = await verifyManifest(manifest, jws, keys, { now });
      return result.valid ? "valid" : result.error;
    };
    expect(await verdict("not a jws")).toBe("malformed");
    expect(await verdict(`${base64url.encode("[]")}..c2ln`)).toBe("malformed");
    expect(await verdict(`${base64url.encode('{"alg":"HS256"}')}..c2ln`)).toBe("unsupported_algorithm");
    expect(await verdict(`${base64url.encode('{"alg":"EdDSA"}')}..c2ln`)).toBe("unsupported_algorithm");
  });
});
