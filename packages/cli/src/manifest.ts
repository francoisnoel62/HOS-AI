import { parseArgs } from "node:util";

import {
  generateManifestKey,
  type JSONWebKeySet,
  type JWK,
  type ManifestSignatureAlgorithm,
  manifestSignatureAlgorithms,
  type ManifestVerification,
  type ProducerManifest,
  signManifest,
  validate,
  type ValidationError,
  verifyManifest,
} from "@hos-ai/sdk";

import { issueLines, plural } from "./format.ts";
import { exit, type Io } from "./io.ts";

// hos manifest: create a signing key, sign a producer manifest, and verify a signed one, from files or from the web.

export const manifestUsage = `Usage: hos manifest keygen --key <file> --jwks <file> [--alg <alg>] [--kid <id>]
       hos manifest sign <manifest.json> --key <file> [--days <n>] [--out <file>]
       hos manifest verify <manifest.json | url> [--jws <file | url>] [--jwks <file> | --jwks-url <url>] [--at <time>]

A producer signs its manifest as HOS Events 0.1 specifies: a JWS on the manifest's canonical form, detached, which
it publishes beside the manifest as manifest.jws, with its public keys in a key set, jwks.json. A public producer
serves the three under /.well-known/hos/ on its origin.

keygen creates a private key and adds its public key to a key set: to start, or to rotate keys. Keep an old key in
the set until every manifest signed with it has expired.

Options of keygen:
      --key <file>          where to write the private key; the file must not exist yet. Keep it secret.
      --jwks <file>         the key set to add the public key to, created if missing
      --alg <alg>           Ed25519, the default, or ES256
      --kid <id>            the key's id, unique in the set (default: its thumbprint, RFC 7638)

Options of sign:
      --key <file>          the private key to sign with
      --days <n>            how many days the signature lasts (default 90); sign again before it expires
      --out <file>          where to write the signature (default: the manifest's file, ending in .jws)

Options of verify:
      --jws <file | url>    the signature (default: the manifest's file or URL, ending in .jws)
      --jwks <file>         the producer's key set
      --jwks-url <url>      the producer's key set on the web. A manifest given by its URL defaults to
                            /.well-known/hos/jwks.json on the same origin.
      --at <time>           verify as of a time, such as 2026-11-01T00:00:00Z, rather than now
      --json                print the result as JSON

  -h, --help                show this help

Exit codes: 0 when done or valid, 1 when the manifest or its signature is invalid, 2 for a usage or read error.
`;

const isUrl = (location: string) => /^https?:\/\//i.test(location);
const jwsBeside = (location: string) => (/\.json$/i.test(location) ? location.replace(/\.json$/i, ".jws") : `${location}.jws`);
const describeKey = (jwk: JWK) => `${jwk.kid} (${jwk.alg ?? jwk.crv})`;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");

class UsageError extends Error {}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${what} is not JSON: ${(error as Error).message}`);
  }
}

async function keygen(values: Record<string, string | boolean | undefined>, io: Io) {
  const { key: keyFile, jwks: jwksFile, alg = "Ed25519", kid } = values as Record<string, string | undefined>;
  if (!keyFile || !jwksFile) throw new UsageError("keygen needs --key and --jwks.");
  if (!manifestSignatureAlgorithms.includes(alg as ManifestSignatureAlgorithm))
    throw new UsageError(`--alg is ${alg}; use ${manifestSignatureAlgorithms.join(" or ")}.`);
  let jwks: JSONWebKeySet = { keys: [] };
  // Only a missing key set starts a new one: any other read error must not lose the keys it holds.
  const existing = await io.readFile(jwksFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new UsageError(`cannot read the key set ${jwksFile}: ${error.message}`);
  });
  if (existing !== undefined) {
    const parsed = parseJson(existing, `The key set ${jwksFile}`) as JSONWebKeySet;
    if (!Array.isArray(parsed?.keys)) throw new UsageError(`${jwksFile} is not a key set: a key set has keys.`);
    jwks = parsed;
  }
  const { privateJwk, publicJwk } = await generateManifestKey({ alg: alg as ManifestSignatureAlgorithm, kid });
  if (jwks.keys.some((key) => key.kid === publicJwk.kid))
    throw new UsageError(`${jwksFile} already has a key with kid ${publicJwk.kid}. A kid names one key.`);

  try {
    await io.writeSecret(keyFile, `${JSON.stringify(privateJwk, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new UsageError(`${keyFile} already exists. A new key goes to a new file, so no key is lost.`);
    throw error;
  }
  await io.writeFile(jwksFile, `${JSON.stringify({ ...jwks, keys: [...jwks.keys, publicJwk] }, null, 2)}\n`);
  io.stdout(
    [
      `Wrote the private key ${describeKey(privateJwk)} to ${keyFile}. Keep it secret: whoever holds it can sign as this producer.`,
      `Added its public key to ${jwksFile}, which now holds ${plural(jwks.keys.length + 1, "key")}. Publish it at /.well-known/hos/jwks.json.`,
      "",
    ].join("\n"),
  );
  return exit.ok;
}

async function sign(manifestFile: string | undefined, values: Record<string, string | boolean | undefined>, io: Io) {
  const { key: keyFile, days = "90", out } = values as Record<string, string | undefined>;
  if (!manifestFile || !keyFile) throw new UsageError("sign needs a manifest and --key.");
  const lifetime = Number(days);
  if (!(lifetime > 0)) throw new UsageError(`--days is ${days}; give a number of days.`);
  const manifest = parseJson(await io.readFile(manifestFile), `The manifest ${manifestFile}`);
  const privateJwk = parseJson(await io.readFile(keyFile), `The key ${keyFile}`) as JWK;

  const checked = validate(manifest);
  if (checked.kind !== "manifest" || !checked.valid) {
    const errors =
      checked.kind === "manifest"
        ? checked.errors
        : [{ path: "", message: "This is not a producer manifest: a manifest has hosmanifestversion.", rule: "events/producers" }];
    io.stdout(
      [
        `✗ ${manifestFile}: not signed, because the manifest fails the checks (${plural(errors.length, "error")})`,
        ...errors.flatMap((error) => issueLines("error", error.message, error)),
        "",
      ].join("\n"),
    );
    return exit.invalid;
  }
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + lifetime * 86_400_000);
  let jws: string;
  try {
    jws = await signManifest(manifest as ProducerManifest, privateJwk, { issuedAt, expiresAt });
  } catch (error) {
    throw new UsageError(`${keyFile}: ${(error as Error).message}`);
  }
  const target = out ?? jwsBeside(manifestFile);
  await io.writeFile(target, `${jws}\n`);
  io.stdout(
    [
      `Signed ${manifestFile} with key ${describeKey(privateJwk)}, until ${iso(Math.floor(expiresAt.getTime() / 1000))}: ${target}.`,
      "Publish it beside the manifest, at /.well-known/hos/manifest.jws, and sign again before it expires.",
      "",
    ].join("\n"),
  );
  return exit.ok;
}

type VerifyResult = {
  valid: boolean;
  producer: string | null;
  manifest: { valid: boolean; errors: ValidationError[] };
  signature: ManifestVerification;
};

function human(result: VerifyResult, { manifest, jws }: { manifest: string; jws: string }) {
  const { signature } = result;
  const lines: string[] = [];
  if (signature.valid) {
    const { header, key } = signature;
    lines.push(`✓ ${jws}: signed with key ${describeKey(key)} on ${iso(header.iat)}, valid until ${iso(header.exp)}`);
  } else {
    lines.push(`✗ ${jws}: ${signature.error.replaceAll("_", " ")}`, ...issueLines("error", signature.message, { rule: "events/signed-manifests" }));
  }
  if (result.manifest.valid) lines.push(`✓ ${manifest}: valid manifest${result.producer ? ` of ${result.producer}` : ""}`);
  else
    lines.push(
      `✗ ${manifest}: manifest that fails the checks (${plural(result.manifest.errors.length, "error")})`,
      ...result.manifest.errors.flatMap((error) => issueLines("error", error.message, error)),
    );
  const who = result.producer ?? "this producer";
  lines.push(
    "",
    result.valid
      ? `✓ The manifest of ${who} is signed and valid.`
      : `✗ The manifest of ${who} fails verification. A consumer treats it as no manifest: nothing it declares is processed.`,
  );
  return `${lines.join("\n")}\n`;
}

async function verify(location: string | undefined, values: Record<string, string | boolean | undefined>, io: Io) {
  const { jws: jwsOption, jwks: jwksFile, "jwks-url": jwksUrlOption, at } = values as Record<string, string | undefined>;
  if (!location) throw new UsageError("verify needs a manifest, as a file or a URL.");
  if (jwksFile && jwksUrlOption) throw new UsageError("give the key set once: --jwks or --jwks-url.");
  const now = at === undefined ? new Date() : new Date(at);
  if (Number.isNaN(now.getTime())) throw new UsageError(`--at is ${at}; give a time such as 2026-11-01T00:00:00Z.`);

  const onWeb = isUrl(location);
  const jwsLocation = jwsOption ?? jwsBeside(location);
  const jwksUrl = jwksUrlOption ?? (onWeb && !jwksFile ? new URL("/.well-known/hos/jwks.json", location).href : undefined);
  if (!jwksFile && !jwksUrl) throw new UsageError("name the producer's key set: --jwks <file> or --jwks-url <url>.");
  const read = (where: string) => (isUrl(where) ? io.fetchText(where) : io.readFile(where));

  let texts: { manifest: string; jws: string; jwks: string };
  try {
    texts = {
      manifest: await read(location),
      jws: await read(jwsLocation),
      jwks: jwksUrl ? await io.fetchText(jwksUrl) : await io.readFile(jwksFile!),
    };
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const manifest = parseJson(texts.manifest, `The manifest ${location}`);
  const jwks = parseJson(texts.jwks, `The key set ${jwksUrl ?? jwksFile}`) as JSONWebKeySet;

  const checked = validate(manifest);
  const errors =
    checked.kind === "manifest"
      ? checked.errors
      : [{ path: "", message: "This is not a producer manifest: a manifest has hosmanifestversion.", rule: "events/producers" }];
  const signature = await verifyManifest(manifest, texts.jws, jwks, { now });
  const producer = typeof (manifest as { producer?: unknown })?.producer === "string" ? (manifest as ProducerManifest).producer : null;
  const result: VerifyResult = { valid: signature.valid && !errors.length, producer, manifest: { valid: !errors.length, errors }, signature };
  io.stdout(values.json ? `${JSON.stringify(result, null, 2)}\n` : human(result, { manifest: location, jws: jwsLocation }));
  return result.valid ? exit.ok : exit.invalid;
}

export async function manifestCommand(args: string[], io: Io): Promise<number> {
  const usageError = (message: string) => {
    io.stderr(`hos manifest: ${message}\nRun hos manifest --help for usage.\n`);
    return exit.usage;
  };
  let options;
  try {
    options = parseArgs({
      args,
      allowPositionals: true,
      options: {
        key: { type: "string" },
        jwks: { type: "string" },
        alg: { type: "string" },
        kid: { type: "string" },
        days: { type: "string" },
        out: { type: "string" },
        jws: { type: "string" },
        "jwks-url": { type: "string" },
        at: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return usageError((error as Error).message);
  }
  const { values, positionals } = options;
  const [subcommand, file, ...extra] = positionals;
  if (values.help || !subcommand) {
    (values.help ? io.stdout : io.stderr)(manifestUsage);
    return values.help ? exit.ok : exit.usage;
  }
  const unexpected = subcommand === "keygen" ? positionals.slice(1) : extra;
  if (unexpected.length) return usageError(`unexpected ${unexpected.join(" ")}.`);
  try {
    if (subcommand === "keygen") return await keygen(values, io);
    if (subcommand === "sign") return await sign(file, values, io);
    if (subcommand === "verify") return await verify(file, values, io);
    return usageError(`unknown subcommand ${subcommand}; use keygen, sign or verify.`);
  } catch (error) {
    if (error instanceof UsageError || (error as NodeJS.ErrnoException).code === "ENOENT") return usageError((error as Error).message);
    throw error;
  }
}
