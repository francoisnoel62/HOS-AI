# Pilot producer

How to run the pilot's persistent producer, watch it, stop it and resume it. It runs the experimental Mews and Apaleo mappings against one property each, for the arrival scenario that closes HOS 0.1 Observe. It is the pilot's reference implementation: HOS itself requires none of its storage.

The producer polls the PMS, read-only, every 2 minutes. It writes what the adapter makes of each poll to Postgres, in one transaction, and consumers read the facts from there. It is a standalone Node process, not a Vercel cron job: the site stays on Vercel's free plan, whose cron jobs run once a day.

## What it keeps

In the `hos_producer` schema of the database (migrations `002` to `004`):

- **the crosswalk**: the opaque HOS id of each PMS entity, never changed once given;
- **the adapter's state**: what HOS has been told about each reservation, unit and maintenance, so a restarted adapter publishes only what changed;
- **the journal**: each fact once, as the JSON text first written, in the order written. A redelivered fact keeps its first content, `hosrecordedat` included.
- **each consumer's position** in the journal;
- **the synchronisation status** of each property: the last attempt, the last success, the last error.

## Set up

1. Apply the migrations to the producer's database: `DATABASE_URL=… npm run db:migrate`.
2. Give the producer read-only PMS credentials:
   - **Mews**: `MEWS_CLIENT_TOKEN` and `MEWS_ACCESS_TOKEN`, and the id of the enterprise they must open. `MEWS_PLATFORM_ADDRESS` defaults to Mews's demo environment.
   - **Apaleo**: `APALEO_CLIENT_ID` and `APALEO_CLIENT_SECRET`, from a simple client (custom app) of the account. Give the app read scopes only: `reservations.read`, `setup.read` and `maintenances.read`.
3. Choose the tenant and the HOS property id the facts carry. They must stay the same for the whole pilot: the crosswalk, the state and the journal are kept per tenant and source.
4. Create the producer's signing key and its key set, once per producer. Keep the private key secret: whoever holds it can sign as the producer.

   ```sh
   npx @hos-ai/cli manifest keygen --key mews-key.json --jwks mews-jwks.json
   ```

## Run

```sh
npm run producer:poll -- --pms mews --mews-enterprise <enterprise id> --tenant <tenant> --property <property id> \
  --publish mews-hos --signing-key mews-key.json --jwks mews-jwks.json
npm run producer:poll -- --pms apaleo --apaleo-property <Apaleo property id> --tenant <tenant> --property <property id> \
  --publish apaleo-hos --signing-key apaleo-key.json --jwks apaleo-jwks.json
```

- `--publish` writes the producer's manifest, its signature and its key set, as `manifest.json`, `manifest.jws` and `jwks.json`, then signs the manifest again every day. A signature lasts `--signature-days`, 7 by default, so a producer stopped for a few days still has a valid one. The manifest's replay window and retention come from `--retention-days`, 30 by default, the same value the purge applies. `--manifest <file>` writes the manifest alone, unsigned.
- The producer checks it reads the right property before it reads anything:
  - **Mews:** it refuses tokens that open another enterprise than `--mews-enterprise`.
  - **Apaleo:** it refuses an app without the three read scopes, and warns when the app may do more than read.

  Both clients refuse addresses without HTTPS.

- `--days`, 2 by default, is how far ahead of today each poll reads reservations, from yesterday.
- Add `--inspections` for an Apaleo property that inspects its rooms, so that Clean means inspected.
- `--once` runs a single poll and exits: 0 when it succeeded, 1 when it failed.

Each poll reads the reservations of the window and those changed since five minutes before the previous poll. A reservation moved out of the window is therefore still read. Deleted Mews blocks and deleted Apaleo maintenances become cancellations. The journal is purged beyond retention once a day.

## Watch

```sh
npm run producer:status -- --tenant <tenant> --source urn:hos:pms:mews
```

For each property, it prints:

- **fresh** or **STALE**. STALE means no poll has succeeded for 10 minutes, or ever.
- **resuming**, when the producer started after its last success and has not succeeded since.
- The last success, the last attempt, the failures in a row and the last error.

It exits with 1 when a property is stale. The last success is dated by when the poll began to read the PMS, and written after the facts: the status can call fresh facts stale, never stale facts fresh. Present stale facts as possibly out of date, never as the current state of the hotel.

The 2 and 10 minutes are the provisional values of FINISH-OBSERVE, to be agreed with the participating operator.

## Stop and resume

Stop the producer with Ctrl+C. It ends the poll under way, then exits. To resume, start the same command again: it carries on from what the database holds, and publishes only what changed meanwhile.

A producer killed outright, or a machine that loses power, loses nothing that was written. A poll is written in one transaction, so the poll under way is written in full or not at all, and the next poll reads the PMS again. After a long stop, a poll reads the changes as far back as the PMS allows (90 days for Mews), and the window.

Run one producer per tenant, source and property. A second one would not corrupt anything, since a poll locks its producer while it runs, but it would poll the PMS twice as often.

## Read the facts

A consumer reads the facts after its position with `readPending`, processes them, then acknowledges the last one with `acknowledge` (`lib/hos/producer/delivery.ts`). If it stops in between, it reads the same facts again, and deduplicates them on source and id. A position only moves forward.

A consumer whose position is behind the purge gets a `JournalGap`: the facts it has not read are gone. Rebuild its view from the producer, then acknowledge the position the error gives, knowingly.

## Publish the manifest, rotate and revoke keys

A consumer trusts the producer's facts through its signed manifest, which declares what it publishes and on what it is the authority. HOS 0.1 signs the manifest, not each event, as FINISH-OBSERVE decided.

- **Publishing.** A public producer serves the `--publish` directory at `/.well-known/hos/` on its HTTPS origin. A private one, as in the pilot, gives its consumers the three files through authenticated URLs or a location they are configured to read. A consumer takes the producer's keys from its own trust configuration, never from beside the manifest alone.
- **Rotation.**
  1. Add a new key to the set: `npx @hos-ai/cli manifest keygen --key mews-key-2.json --jwks mews-jwks.json`.
  2. Restart the producer with `--signing-key mews-key-2.json`. It publishes the set with both keys, and signs with the new one.
  3. Give the consumers the new key set, if they keep their own copy.
  4. Once every signature made with the old key has expired, `--signature-days` after the restart, remove the old key from the set and destroy its private key.
- **Revocation.** Remove a private key that may be exposed from the key set at once, and from every consumer's trust configuration. Whatever it signed then fails verification. Consumers treat that manifest as missing and process none of the producer's facts until a trusted key signs it. Create a new key, restart the producer with it, and give the consumers the new key set.

## Export and check

```sh
npm run producer:export -- --tenant <tenant> --source urn:hos:pms:mews --out mews.jsonl
npm run producer:export -- --tenant <tenant> --source urn:hos:pms:mews --since 2026-10-01T00:00:00Z --out today.jsonl
hos conformance producer --manifest mews-hos/manifest.json --stream mews.jsonl
hos manifest verify mews-hos/manifest.json --jwks mews-jwks.json
```

The export is JSON Lines, the replay format of HOS Events: the whole journal, the facts after a position (`--after`), or those recorded since a time (`--since`). It says when retention has purged the start of the journal.

`hos conformance producer` checks the facts against the manifest, but not the manifest's signature: `hos manifest verify` checks that separately, with the key set the consumers trust.

## When it fails

A failed poll writes nothing and is retried at the next interval. The status shows its error:

- **An entity the adapter cannot read** fails the whole poll, and the error names it, such as `Mews ServiceOrderUpdated <id>: …`. The property stays stale until the adapter is fixed, rather than skip that entity silently.
- **A list longer than the poll may read** (50 pages) fails the poll, rather than lose the changes it did not read.
- **A token or rate-limit error** from the PMS is retried by the client first: Apaleo tokens are renewed, and a `429` waits for `Retry-After`.

The facts already written stay valid. Once the cause is fixed, the next poll catches up.
