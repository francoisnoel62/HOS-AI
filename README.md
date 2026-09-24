# HOS AI website

Local-first implementation of the HOS AI public website. It is a Next.js App Router project with TypeScript, Tailwind CSS, locally owned shadcn/ui-compatible primitives, Lucide icons and a Docker-backed local Postgres database for form development.

This repository is intentionally not deployed or connected to a live email, analytics, anti-spam or cloud-database provider. The project must not be published until the founder completes the external decisions in the implementation plan and production legal pages are accurate.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Generate two local values and place them in `.env.local`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Use the first for `FORM_ENCRYPTION_KEY` and the second for `RATE_LIMIT_SALT`.
3. Start local Postgres:

   ```powershell
   docker compose up -d postgres
   ```

4. Install packages, migrate the local schema and start the site:

   ```powershell
   npm.cmd install
   npm.cmd run db:migrate
   npm.cmd run dev
   ```

Open [http://localhost:3000](http://localhost:3000). `LOCAL_FORMS_MODE=true` permits the local-only anti-spam bypass; never use it outside your computer. Valid local form submissions are encrypted in Postgres. Internal notifications and acknowledgements are JSON files under `data/outbox/`; no message is sent outside the computer.

## HOS 0.1 specification artefacts

The HOS Core 0.1 and HOS Events 0.1 drafts live in `public/spec/0.1/` and are served as static files: JSON Schemas for the Core, the event envelope, the event catalogue and Event Producer manifests, one example per event type, and the arrival-readiness conformance scenario (`events.jsonl`, `expected.json`, producer manifests). `lib/hos/projection.ts` is the non-normative reference implementation of the arrival-readiness projection; the `/demo` page and `tests/unit/hos-conformance.test.ts` both run it against the published files, and the `/docs/core` and `/docs/events` tables are generated from the schemas, so the site, the schemas and the expected outcome cannot drift apart.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Run the Playwright browser installation once if needed:

```powershell
npm.cmd exec playwright install chromium
```

## Boundaries

- No accounts, payments, scheduling, CMS, comments, newsletter, active Data Cooperative or live PMS integration.
- No guest data, API credentials, exports or confidential commercial data belong in any public form.
- The local form outbox is an engineering substitute for transactional email only. It is not a production delivery service.
- The local Postgres password in `docker-compose.yml` is development-only.
- `app/legal/page.tsx` and `app/privacy/page.tsx` are templates that require founder-owned review before public release.

## Licensing and marks

The site code is licensed under [Apache-2.0](LICENSE). The HOS AI name, temporary mark, logo and editorial content are not granted for reuse by that code licence.
