import { setTimeout as sleep } from "node:timers/promises";

// A client of the Apaleo API for the live check and the pilot's producer, with the credentials of a simple client
// (custom app). It sends GET requests only and never writes to Apaleo. The credentials and tokens are never printed.

export type ApaleoClient = {
  // A GET answer; null when Apaleo answers 204 No Content, as it does for a page with no items.
  get<T>(path: string, query?: Record<string, string>): Promise<T | null>;
  // One entity; null when Apaleo does not know it (404), as for a deleted maintenance.
  find<T>(path: string): Promise<T | null>;
  // Every page of a list. Past maxPages, onTruncated "warn" returns what it has and "fail" throws: a poll that read part
  // of the changes would never read the rest.
  list<T>(path: string, key: string, query: Record<string, string>): Promise<T[]>;
  // The scopes Apaleo granted the app's current token.
  scopes(): Promise<string[]>;
};

// Apaleo takes times without fractional seconds.
export const apaleoTime = (instant: number) => new Date(instant).toISOString().replace(/\.\d{3}Z$/, "Z");

export function createApaleoClient({
  identity,
  api,
  clientId,
  clientSecret,
  maxPages = 25,
  onTruncated = "warn",
  fetch = globalThis.fetch,
}: {
  identity: string;
  api: string;
  clientId: string;
  clientSecret: string;
  maxPages?: number;
  onTruncated?: "warn" | "fail";
  fetch?: typeof globalThis.fetch;
}): ApaleoClient {
  for (const address of [identity, api])
    if (new URL(address).protocol !== "https:")
      throw new Error(`Apaleo's addresses must use HTTPS, so the credentials never travel in clear: ${address}.`);
  const pageSize = 200;
  // A 429 waits for Retry-After, or backs off, and retries.
  const retries = 5;
  let token: { value: string; expiresAt: number; scopes: string[] } | undefined;

  // A client credentials token lives an hour: it is renewed a minute before it expires, or when Apaleo refuses it.
  async function accessToken() {
    if (token && Date.now() < token.expiresAt - 60_000) return token.value;
    // The client credentials grant, as Apaleo's own n8n node requests it.
    const response = await fetch(`${identity}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!response.ok) throw new Error(`The token request answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const granted = (await response.json()) as { access_token: string; expires_in: number; scope?: string };
    token = {
      value: granted.access_token,
      expiresAt: Date.now() + granted.expires_in * 1000,
      scopes: (granted.scope ?? "").split(" ").filter(Boolean),
    };
    return token.value;
  }

  async function scopes() {
    await accessToken();
    return token!.scopes;
  }

  async function request(path: string, query: Record<string, string>) {
    const url = new URL(path, api);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" } });
      if (response.status === 401 && !renewed) {
        await response.body?.cancel();
        token = undefined;
        renewed = true;
        continue;
      }
      if (response.status === 429 && attempt < retries) {
        await response.body?.cancel();
        await sleep(1000 * (Number(response.headers.get("retry-after")) || 2 ** attempt));
        continue;
      }
      return response;
    }
  }

  const failure = async (path: string, response: Response) =>
    new Error(
      `GET ${path} answered ${response.status}${response.status === 403 ? " (is a read scope missing from the app?)" : ""}: ${(await response.text()).slice(0, 300)}`,
    );

  async function get<T>(path: string, query: Record<string, string> = {}): Promise<T | null> {
    const response = await request(path, query);
    if (response.status === 204) return null;
    if (!response.ok) throw await failure(path, response);
    return (await response.json()) as T;
  }

  async function find<T>(path: string): Promise<T | null> {
    const response = await request(path, {});
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) throw await failure(path, response);
    return (await response.json()) as T;
  }

  async function list<T>(path: string, key: string, query: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const response = await get<{ count?: number } & Record<string, T[]>>(path, { ...query, pageNumber: String(page), pageSize: String(pageSize) });
      const batch = response?.[key] ?? [];
      items.push(...batch);
      const total = response?.count;
      if (!batch.length || (total === undefined ? batch.length < pageSize : items.length >= total)) return items;
    }
    if (onTruncated === "fail") throw new Error(`${path}: more than ${maxPages} pages of ${pageSize}.`);
    console.warn(`${path}: stopped after ${maxPages} pages.`);
    return items;
  }

  return { get, find, list, scopes };
}
