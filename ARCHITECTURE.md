# Architecture — Saadaa Retention Dashboard (KwikEngage)

A self-hosted analytics dashboard for the **Saadaa** D2C retention stack. It ingests
CSV/XLSX exports from KwikEngage / Tellephant / GoKwik, stores them in Supabase
Postgres, and renders campaign, automation, segment, offer, funnel, revenue,
audience and historical analytics — all in a single-page Next.js app (deployed on
Vercel).

This document describes *how the app is built*. For product/behaviour narrative see
`DOCUMENTATION.md` and `CONTEXT.md`; for the AI-agent working rules see `CLAUDE.md`
/ `AGENTS.md`.

---

## 1. Purpose

The marketing team runs WhatsApp / SMS / Email / RCS retention campaigns through
KwikEngage and automations through KwikEngage / GoKwik. Those platforms expose
per-send analytics only as CSV/XLSX exports, with no first-party view that joins:

- **Campaign metadata** — campaign ID, source type, segment, offer, content
  format, audience (Purchaser vs Non-Purchaser), all *derived by parsing the
  campaign name*.
- **Platform metrics** — sent / delivered / seen / clicks / buyers / sales /
  orders / cost / ROAS.
- **Creative assets** — template name, copy, and Google Drive media link.
- **Operational classification** — template type (Marketing / Utility / …),
  status (Active / Paused / Deleted), and per-message cost.

This app is that joined view. It also **derives ROAS** from a per-template cost
rate card when the source export didn't provide one, and **attributes Shopify
orders** back to campaigns via UTM parameters.

---

## 2. Tech stack

| Layer        | Choice |
| ------------ | ------ |
| Framework    | **Next.js 16.2** (App Router, Turbopack) — see `next.config.ts` |
| UI runtime   | **React 19.2** |
| Language     | **TypeScript 5** (strict; path alias `@/* → ./src/*` in `tsconfig.json`) |
| Styling      | **Tailwind CSS 4** via PostCSS (`postcss.config.mjs`, `src/app/globals.css`) |
| State        | **Zustand 5** (`src/lib/store.ts`) |
| Charts       | **Recharts 3.8** |
| Icons        | **lucide-react** |
| Database     | **Supabase Postgres** (`@supabase/supabase-js`) |
| CSV parsing  | **papaparse** |
| XLSX parsing | **xlsx** (SheetJS) |
| Date utils   | **date-fns** |
| Fonts        | **Inter** via `next/font/google` |
| Hosting      | **Vercel** |

> ⚠️ This Next.js is on the 16.2 train. App Router conventions, per-route segment
> config (`export const runtime = 'nodejs'`, `maxDuration`), and React 19 hooks all
> apply — do **not** assume Pages Router patterns. `AGENTS.md` reinforces this.

---

## 3. Directory layout

```
.
├── src/
│   ├── app/
│   │   ├── layout.tsx        Root layout — Inter font, <html>/<body> shell, metadata
│   │   ├── page.tsx          The entire dashboard SPA — every tab lives in this one file
│   │   ├── globals.css       Tailwind directives + animations + drawer keyframes
│   │   └── api/              Route handlers (server-only, use the admin client)
│   │       ├── campaigns/            GET  — filtered campaigns (merges roas ?? calculated_roas)
│   │       ├── automations/          GET  — filtered automations (same roas merge)
│   │       ├── campaign-creatives/   GET ?campaign_id= + POST .xlsx upload
│   │       ├── automation-creatives/ GET ?name=        + POST .xlsx upload
│   │       ├── templates/            GET unified template list + PATCH (type/status/cost, triggers ROAS recalc)
│   │       ├── template-type-costs/  Legacy rate-card endpoint (kept for back-compat)
│   │       ├── upload/               POST campaign/automation CSV — parse, dedup, insert, derive calculated_roas
│   │       └── sync/                 GET (cron, CRON_SECRET) / POST (manual) — Shopify → utm_orders sync
│   ├── components/
│   │   ├── layout/Sidebar.tsx    Left nav (Analytics + Intelligence tab groups), Upload / Sync buttons
│   │   ├── layout/TopBar.tsx     Global filter bar (date, channel, campaign, segment, offer)
│   │   ├── ui/index.tsx          Shared presentational primitives (KpiCard, Panel, Th/Td, RoasBadge, …)
│   │   └── ui/UploadModal.tsx    CSV/XLSX upload dialog (type hint, snapshot date / date range)
│   ├── lib/
│   │   ├── supabase.ts       Lazy browser client + server-only admin client factory
│   │   ├── store.ts          Zustand store: campaigns/automations data, filters, scope, fetch actions
│   │   ├── parser.ts         CSV parsing + campaign-name → dimensions extraction (offer/format/segment)
│   │   ├── metrics.ts        Pure metric helpers (rates, ROAS, funnel, KPI/segment/offer/daily rollups)
│   │   └── definitions.ts    Per-tab metric-definition text shown in the DefinitionsPanel
│   └── types/index.ts        Domain types (Campaign, Automation, *Summary, TemplateRow, UploadResult, …)
├── supabase-schema.sql       Full DB schema — tables, indexes, views, RLS policies
├── next.config.ts            Turbopack root config
├── tsconfig.json             Strict TS, @/* path alias
├── .env.example              Required environment variables
├── DOCUMENTATION.md          Product/behaviour reference
├── CONTEXT.md                Working context / naming-convention notes
├── CLAUDE.md / AGENTS.md      AI-agent guardrails (defers to node_modules/next docs)
└── ARCHITECTURE.md           This file
```

> Note: the whole dashboard UI is a single client component tree rooted in
> `src/app/page.tsx` (`'use client'`). Tabs (Overview, Campaigns, Automations,
> Templates, Segment/Offer/Funnel/Revenue/Historical) are functions inside that
> file, switched by local state and rendered client-side.

---

## 4. Supabase data model

Defined in `supabase-schema.sql`. UUID primary keys (`uuid-ossp`). Row Level
Security is enabled on every table with **read-only** policies for the anon key;
all writes go through the **service role** used by the API routes.

### Core fact tables

- **`campaigns`** — one row per campaign send (parsed from the campaigns CSV).
  Columns: `name`, `campaign_id` (C130, HTC01, MPC01 …), `source_type`, `segment`,
  `offer`, `format`, `channel` (default `whatsapp`), `date`, and metrics
  `sent / delivered / seen / ctr / clicks / buyers / unsubscribers / sales /
  orders / cost / roas`, plus `source_raw` and `ingested_at`.
  **No unique constraint on `(name, date)` by design** — multiple rows with the
  same key but different metrics are allowed; the upload route dedups only
  byte-identical rows.

- **`automations`** — one row per automation snapshot. Same metric columns as
  campaigns, plus `type` (`standard` | `cart_recovery`) and cart-recovery fields
  `recovered_amount` / `recovered_carts`. Per-row `date` is required at insert;
  multiple rows per `(name, date)` are allowed (same dedup model as campaigns).

### Creative / classification tables

- **`automation_creatives`** — one row per `(automation_name, template_name)`
  (unique). Holds `template_copy`, `creative_media_link` (Drive), and manually
  set `template_type` / `status`.
- **`campaign_creatives`** — one row per `(campaign_id, template_name)` (unique),
  looked up by `campaign_id`. Same shape plus a `channel` column.
- **`template_type_costs`** — per-template-type rate card (`cost_per_message`,
  ₹ per delivered message). One row per type. Used to derive ROAS when the CSV
  omitted it.

### Operational tables

- **`raw_exports`** — audit log of every uploaded file (`filename`, `export_type`,
  `row_count`, `inserted`, `skipped`, `file_path`).
- **`utm_orders`** — Shopify orders with parsed UTM attribution, keyed by
  `shopify_order_id` (unique). Matched back to `campaigns.name` / `campaign_id`.

### Views (aggregations over `campaigns`)

- **`campaign_daily_summary`** — per-`date` totals + delivery/open rate + ROAS.
- **`segment_summary`** — per-`segment` rollup with CTR, ROAS, revenue-per-delivered.
- **`offer_summary`** — per-`offer` rollup with buyer-conversion, ROAS, etc.

> The UI mostly computes its own rollups client-side (see `src/lib/metrics.ts` and
> the `useMemo` aggregations in `page.tsx`) rather than reading these SQL views;
> the views exist for direct/ad-hoc SQL analysis.

---

## 5. Data flow

### Read path (dashboard → Supabase)

1. On load, the Zustand store (`src/lib/store.ts`) calls `fetchCampaigns()` /
   `fetchAutomations()`, which hit `/api/campaigns` and `/api/automations` with the
   active `GlobalFilters` serialized as query params.
2. Those **server route handlers** (`src/app/api/.../route.ts`) build a filtered
   Supabase query via the **admin client** (`createAdminClient()` in
   `src/lib/supabase.ts`, which bypasses RLS using the service role key) and return
   JSON. `roas` is surfaced as `roas ?? calculated_roas ?? null`.
3. The store holds the returned rows; tab components subscribe with selectors and
   compute all aggregations client-side (`src/lib/metrics.ts` + local `useMemo`s —
   campaign-ID grouping, segment categorization, audience classification, funnels).
4. Creative drawers lazy-fetch `/api/campaign-creatives?campaign_id=` /
   `/api/automation-creatives?name=` on open.

The dashboard tree is entirely a **client component** (`'use client'` at the top of
`page.tsx`); Supabase is never queried directly from the browser — every read goes
through an API route.

### Write / ingestion path

1. **CSV upload** (`UploadModal` → `POST /api/upload`): the file is parsed by
   `src/lib/parser.ts`. `detectExportType()` sniffs headers to pick
   `campaigns` / `automations` / `gokwik_carts`; `parseCampaignName()` extracts
   `campaign_id`, `source_type`, `offer`, and `format` from the underscore-delimited
   name, and `extractSegment()` pulls the included segment.
2. The route dedups against existing rows in chunked lookups (PostgREST URL-length
   safe), inserting only rows that aren't byte-identical to an existing
   `(name, date)` variant, then derives `calculated_roas` from the matching
   creative's `cost_per_message`. Results are logged to `raw_exports` and returned
   as an `UploadResult` (`inserted` / `updated` / `skipped` / `errors`).
3. **Creatives upload** (`.xlsx` → `campaign-creatives` / `automation-creatives`
   routes) upserts template copy, media links, type, status and cost.
4. **Shopify sync** (`/api/sync`): fetches recent orders from the Shopify Admin API,
   extracts UTM params from each order's `landing_site`, and upserts into
   `utm_orders` keyed on `shopify_order_id`. Triggerable manually (POST from the
   Sync button) or via cron (GET, guarded by `CRON_SECRET`).

---

## 6. Environment & configuration

Copy `.env.example` → `.env.local`. Required variables:

| Variable | Used by |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Both clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client (read-only via RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server admin client (bypasses RLS) — **server only** |
| `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION` | `/api/sync` |
| `CRON_SECRET` | Guards `GET /api/sync` cron access |
| `KWIK_API_BASE_URL`, `KWIK_API_KEY`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_BRAND` | Config/branding |

`src/lib/supabase.ts` validates these at first use and rejects placeholder values.

---

## 7. Build & deploy

Scripts (`package.json`):

- `npm run dev` — local dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint (`eslint-config-next`, `eslint.config.mjs`)

**Database setup:** run `supabase-schema.sql` in the Supabase SQL Editor, then
create a private Storage bucket named `exports` (service-role uploads only), as
noted at the end of the schema file.

**Hosting:** deployed on Vercel. API routes that do heavy work set
`runtime = 'nodejs'` and raised `maxDuration` (e.g. `/api/upload` → 300s,
`/api/templates` → 120s, `/api/sync` → 60s) to accommodate large ingestion and
external API calls.
