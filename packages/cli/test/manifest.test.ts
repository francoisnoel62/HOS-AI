import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type JSONWebKeySet, verifyManifest } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import { hos, specDirectory } from "./run.ts";

// hos manifest: keys, signatures and their verification, from files held in memory and from the web, against the
// published signing vectors and the /.well-known/hos/ example.

const signing = path.join(specDirectory, "conformance", "signing");
const read = (file: string) => readFileSync(path.join(signing, file), "utf8");
const manifestText = read("well-known/manifest.json");

type Vector = { at: string; manifest: unknown; jws: string; jwks: JSONWebKeySet; expected: { valid: boolean; error?: string } };
const vectors = readdirSync(signing)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => [file, JSON.parse(read(file)) as Vector] as const);

// Runs keygen, then sign, as a producer would, and returns every file written.
async function keyAndSignature(alg = "Ed25519") {
  const keygen = await hos(["manifest", "keygen", "--key", "key.json", "--jwks", "jwks.json", "--alg", alg]);
  expect(keygen.code).toBe(0);
  const files: Record<string, string> = { "manifest.json": manifestText, ...keygen.written };
  const signed = await hos(["manifest", "sign", "manifest.json", "--key", "key.json"], { files });
  expect(signed.code).toBe(0);
  return { files: { ...files, ...signed.written }, keygen, signed };
}

describe("hos manifest keygen", () => {
  it("writes a private key and a key set with its public key", async () => {
    const { code, stdout, written } = await hos(["manifest", "keygen", "--key", "key.json", "--jwks", "jwks.json", "--kid", "2026-10"]);
    expect(code).toBe(0);
    expect(JSON.parse(written["key.json"])).toMatchObject({
      kid: "2026-10",
      kty: "OKP",
      crv: "Ed25519",
      d: expect.any(String),
      alg: "Ed25519",
      use: "sig",
    });
    const jwks = JSON.parse(written["jwks.json"]);
    expect(jwks.keys).toEqual([expect.objectContaining({ kid: "2026-10", alg: "Ed25519" })]);
    expect(jwks.keys[0]).not.toHaveProperty("d");
    expect(stdout).toBe(
      "Wrote the private key 2026-10 (Ed25519) to key.json. Keep it secret: whoever holds it can sign as this producer.\n" +
        "Added its public key to jwks.json, which now holds 1 key. Publish it at /.well-known/hos/jwks.json.\n",
    );
  });

  it("adds a new key to an existing key set, to rotate keys", async () => {
    const first = await hos(["manifest", "keygen", "--key", "old.json", "--jwks", "jwks.json", "--kid", "2026-09"]);
    const second = await hos(["manifest", "keygen", "--key", "new.json", "--jwks", "jwks.json", "--kid", "2026-12", "--alg", "ES256"], {
      files: { "jwks.json": first.written["jwks.json"] },
    });
    expect(second.code).toBe(0);
    expect(JSON.parse(second.written["jwks.json"]).keys.map((key: { kid: string; kty: string }) => `${key.kid} ${key.kty}`)).toEqual([
      "2026-09 OKP",
      "2026-12 EC",
    ]);
    expect(second.stdout).toContain("which now holds 2 keys");
  });

  it("never overwrites a key, nor reuses a kid", async () => {
    const existing = await hos(["manifest", "keygen", "--key", "key.json", "--jwks", "jwks.json"], { files: { "key.json": "{}" } });
    expect(existing).toMatchObject({
      code: 2,
      written: {},
      stderr: expect.stringContaining("key.json already exists. A new key goes to a new file, so no key is lost."),
    });
    const first = await hos(["manifest", "keygen", "--key", "a.json", "--jwks", "jwks.json", "--kid", "k1"]);
    const again = await hos(["manifest", "keygen", "--key", "b.json", "--jwks", "jwks.json", "--kid", "k1"], {
      files: { "jwks.json": first.written["jwks.json"] },
    });
    expect(again).toMatchObject({
      code: 2,
      written: {},
      stderr: expect.stringContaining("jwks.json already has a key with kid k1. A kid names one key."),
    });
  });

  it("offers Ed25519 and ES256 only", async () => {
    const { code, stderr } = await hos(["manifest", "keygen", "--key", "key.json", "--jwks", "jwks.json", "--alg", "RS256"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--alg is RS256; use Ed25519 or ES256.");
  });
});

describe("hos manifest sign and verify", () => {
  it.each(["Ed25519", "ES256"])("sign with %s a manifest that the SDK and hos verify", async (alg) => {
    const { files, signed } = await keyAndSignature(alg);
    const jwks = JSON.parse(files["jwks.json"]) as JSONWebKeySet;
    expect(signed.stdout).toMatch(
      new RegExp(`^Signed manifest\\.json with key ${jwks.keys[0].kid} \\(${alg}\\), until \\d{4}-\\d\\d-\\d\\dT[\\d:]+Z: manifest\\.jws\\.\\n`),
    );
    expect(await verifyManifest(JSON.parse(manifestText), files["manifest.jws"], jwks)).toMatchObject({
      valid: true,
      header: { alg, kid: jwks.keys[0].kid },
    });

    const verified = await hos(["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], { files });
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain("✓ The manifest of https://housekeeping.example is signed and valid.");
  });

  it("signs for 90 days, or as many as --days says", async () => {
    const { files } = await keyAndSignature();
    const header = (jws: string) => JSON.parse(Buffer.from(jws.split(".")[0], "base64url").toString("utf8"));
    const { iat, exp } = header(files["manifest.jws"]);
    expect(exp - iat).toBe(90 * 86_400);
    const week = await hos(["manifest", "sign", "manifest.json", "--key", "key.json", "--days", "7", "--out", "week.jws"], { files });
    const shorter = header(week.written["week.jws"]);
    expect(shorter.exp - shorter.iat).toBe(7 * 86_400);
  });

  it("refuses to sign a manifest that fails the checks", async () => {
    const { files } = await keyAndSignature();
    const invalid = JSON.stringify({ ...JSON.parse(manifestText), limitations: [""] });
    const { code, stdout, written } = await hos(["manifest", "sign", "manifest.json", "--key", "key.json"], {
      files: { ...files, "manifest.json": invalid },
    });
    expect(code).toBe(1);
    expect(written).toEqual({});
    expect(stdout).toMatch(/^✗ manifest\.json: not signed, because the manifest fails the checks \(1 error\)\n/);
  });

  it("refuses to sign with a public key", async () => {
    const { files } = await keyAndSignature();
    const [publicKey] = JSON.parse(files["jwks.json"]).keys;
    const { code, stderr } = await hos(["manifest", "sign", "manifest.json", "--key", "public.json"], {
      files: { ...files, "public.json": JSON.stringify(publicKey) },
    });
    expect(code).toBe(2);
    expect(stderr).toContain("public.json: A manifest is signed with a private key");
  });

  it("fails a manifest changed after it was signed, and says why", async () => {
    const { files } = await keyAndSignature();
    const changed = JSON.stringify({ ...JSON.parse(manifestText), limitations: ["None."] });
    const { code, stdout } = await hos(["manifest", "verify", "manifest.json", "--jwks", "jwks.json"], {
      files: { ...files, "manifest.json": changed },
    });
    expect(code).toBe(1);
    expect(stdout).toContain("✗ manifest.jws: bad signature\n  error   The signature does not match this manifest and key");
    expect(stdout).toContain("          rule events/signed-manifests\n✓ manifest.json: valid manifest of https://housekeeping.example\n");
    expect(stdout).toMatch(
      /✗ The manifest of https:\/\/housekeeping\.example fails verification\. A consumer treats it as no manifest: nothing it declares is processed\.\n$/,
    );
  });
});

describe("hos manifest verify", () => {
  it.each(vectors)("gives conformance/signing/%s its expected verdict", async (_, vector) => {
    const files = { "manifest.json": JSON.stringify(vector.manifest), "manifest.jws": vector.jws, "jwks.json": JSON.stringify(vector.jwks) };
    const { code, stdout } = await hos(["manifest", "verify", "manifest.json", "--jwks", "jwks.json", "--at", vector.at, "--json"], { files });
    expect(code).toBe(vector.expected.valid ? 0 : 1);
    const { signature } = JSON.parse(stdout);
    expect(signature.valid ? { valid: true } : { valid: false, error: signature.error }).toEqual(vector.expected);
  });

  it("verifies a producer's manifest from its URL, with the keys it publishes on the same origin", async () => {
    const base = "https://housekeeping.example/.well-known/hos/";
    const urls = {
      [`${base}manifest.json`]: manifestText,
      [`${base}manifest.jws`]: read("well-known/manifest.jws"),
      [`${base}jwks.json`]: read("well-known/jwks.json"),
    };
    const [key] = JSON.parse(urls[`${base}jwks.json`]).keys;
    const { code, stdout } = await hos(["manifest", "verify", `${base}manifest.json`, "--at", "2026-10-01T00:00:00Z"], { urls });
    expect(code).toBe(0);
    expect(stdout).toBe(
      [
        `✓ ${base}manifest.jws: signed with key ${key.kid} (Ed25519) on 2026-09-26T00:00:00Z, valid until 2027-09-26T00:00:00Z`,
        `✓ ${base}manifest.json: valid manifest of https://housekeeping.example`,
        "",
        "✓ The manifest of https://housekeeping.example is signed and valid.",
        "",
      ].join("\n"),
    );
    const expired = await hos(["manifest", "verify", `${base}manifest.json`, "--at", "2027-10-01T00:00:00Z"], { urls });
    expect(expired.code).toBe(1);
    expect(expired.stdout).toContain(
      "✗ https://housekeeping.example/.well-known/hos/manifest.jws: expired\n  error   The signature expired on 2027-09-26T00:00:00.000Z.",
    );
  });

  it("reports a document it cannot fetch as a read error", async () => {
    const { code, stderr } = await hos(["manifest", "verify", "https://pms.example/.well-known/hos/manifest.json"], {
      urls: { "https://pms.example/.well-known/hos/manifest.json": manifestText },
    });
    expect(code).toBe(2);
    expect(stderr).toContain("hos manifest: https://pms.example/.well-known/hos/manifest.jws answers 404 Not Found");
  });

  it.each([
    ["no key set", ["verify", "manifest.json"], "name the producer's key set: --jwks <file> or --jwks-url <url>."],
    [
      "two key sets",
      ["verify", "manifest.json", "--jwks", "a.json", "--jwks-url", "https://a.example/jwks.json"],
      "give the key set once: --jwks or --jwks-url.",
    ],
    [
      "a time that is not one",
      ["verify", "manifest.json", "--jwks", "a.json", "--at", "soon"],
      "--at is soon; give a time such as 2026-11-01T00:00:00Z.",
    ],
    ["no manifest", ["sign", "--key", "key.json"], "sign needs a manifest and --key."],
    ["an unknown subcommand", ["publish"], "unknown subcommand publish; use keygen, sign or verify."],
    ["an extra file", ["verify", "a.json", "b.json"], "unexpected b.json."],
  ])("refuses %s", async (_, args, message) => {
    const { code, stderr } = await hos(["manifest", ...args]);
    expect(code).toBe(2);
    expect(stderr).toBe(`hos manifest: ${message}\nRun hos manifest --help for usage.\n`);
  });

  it("prints its help", async () => {
    const { code, stdout } = await hos(["manifest", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^Usage: hos manifest keygen/);
    expect((await hos(["--help"])).stdout).toContain("manifest verify <file>    verify a signed manifest, from files or from its URL\n");
  });
});
