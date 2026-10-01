import { setTimeout as sleep } from "node:timers/promises";

import { accommodationServices, type MewsResourceCategory, type MewsService } from "@/lib/hos/mappings/mews-sync";

// A client of the Mews Connector API for the live check and the pilot's producer. They call Get operations only and
// never write to Mews. The tokens are never printed.

export type MewsClient = {
  call<T>(operation: string, body?: Record<string, unknown>): Promise<T>;
  // Every page of a Get all operation. Past maxPages, onTruncated "warn" returns what it has and "fail" throws: a poll
  // that read part of the changes would never read the rest.
  getAll<T>(operation: string, key: string, body: Record<string, unknown>): Promise<T[]>;
};

type Page = { Cursor?: string | null };

export function createMewsClient({
  platform,
  clientToken,
  accessToken,
  client,
  maxPages = 10,
  onTruncated = "warn",
  fetch = globalThis.fetch,
}: {
  platform: string;
  clientToken: string;
  accessToken: string;
  // The name Mews logs for each request.
  client: string;
  maxPages?: number;
  onTruncated?: "warn" | "fail";
  fetch?: typeof globalThis.fetch;
}): MewsClient {
  // Mews allows 1,000 items a page.
  const pageSize = 1000;
  // Mews allows 200 requests per access token in 30 seconds, and everyone who tries the public demo tokens shares them:
  // a 429 waits for Retry-After, or backs off, and retries.
  const retries = 5;

  async function call<T>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${platform}/api/connector/v1/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ClientToken: clientToken, AccessToken: accessToken, Client: client, ...body }),
      });
      if (response.status === 429 && attempt < retries) {
        await response.body?.cancel();
        await sleep(1000 * (Number(response.headers.get("retry-after")) || 2 ** attempt));
        continue;
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`${operation} answered ${response.status}: ${detail.slice(0, 300)}`);
      }
      return (await response.json()) as T;
    }
  }

  async function getAll<T>(operation: string, key: string, body: Record<string, unknown>): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      const response = await call<Page & Record<string, T[]>>(operation, {
        ...body,
        Limitation: { Count: pageSize, ...(cursor ? { Cursor: cursor } : {}) },
      });
      const batch = response[key] ?? [];
      items.push(...batch);
      cursor = response.Cursor;
      if (!cursor || batch.length < pageSize) return items;
    }
    if (onTruncated === "fail") throw new Error(`${operation}: more than ${maxPages} pages of ${pageSize}.`);
    console.warn(`${operation}: stopped after ${maxPages} pages.`);
    return items;
  }

  return { call, getAll };
}

// The enterprise behind the access token, its bookable services, and those guests stay in. serviceIds overrides the
// accommodation services.
export async function fetchMewsEnterprise(mews: MewsClient, serviceIds?: string[]) {
  const configuration = await mews.call<{ Enterprise: { Id: string; Name?: string; TimeZoneIdentifier: string } }>("configuration/get");
  const enterprise = {
    id: configuration.Enterprise.Id,
    name: configuration.Enterprise.Name ?? null,
    timezone: configuration.Enterprise.TimeZoneIdentifier,
  };
  const scope = { EnterpriseIds: [enterprise.id] };
  const services = await mews.getAll<MewsService>("services/getAll", "Services", scope);
  const bookable = services.filter((service) => service.IsActive && service.Data.Discriminator === "Bookable");
  // Bookable services with rooms, beds, apartments or pitches are stays; the others are parking, meeting rooms and the
  // like.
  const categories =
    serviceIds || !bookable.length
      ? []
      : await mews.getAll<MewsResourceCategory>("resourceCategories/getAll", "ResourceCategories", {
          ...scope,
          ServiceIds: bookable.map((service) => service.Id),
          ActivityStates: ["Active"],
        });
  const accommodation = serviceIds ?? accommodationServices(bookable, categories);
  if (!accommodation.length) throw new Error("No accommodation service found; set MEWS_SERVICE_IDS.");
  return { enterprise, services, bookable, accommodation };
}
