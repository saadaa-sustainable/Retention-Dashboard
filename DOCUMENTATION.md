# Saadaa Retention Dashboard — Project Documentation

A self-hosted analytics dashboard for the **Saadaa** D2C retention stack. It ingests CSV/XLSX exports from KwikEngage / Tellephant / GoKwik and renders campaign, automation, segment, offer, funnel, revenue and historical analytics on top of Supabase Postgres. Built as a single-page Next.js app deployed on Vercel.

---

## 1. What it does

The marketing team runs WhatsApp / SMS / Email retention campaigns through KwikEngage and automations through KwikEngage / GoKwik. Those platforms expose per-send analytics as CSV exports. There is no first-party dashboard that joins campaign metadata (segment, offer, content theme), platform metrics (sent / delivered / clicks / buyers / sales), and creative assets (copy + image) in one place.

This project is that joined view:

- Upload a CSV → it's parsed, classified and merged into Supabase.
- Upload a creatives Excel → message bodies and Drive image links are linked to the right automation / campaign.
- The dashboard slices everything by **date, channel, campaign ID, segment, offer** — and lets you drill from a high-level overview into a single template's creative.

---

## 2. Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16.2** (App Router, React 19.2) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 (PostCSS) |
| State | **Zustand 5** (`src/lib/store.ts`) |
| Charts | **Recharts 3.8** |
| Icons | lucide-react |
| Database | **Supabase Postgres** (`@supabase/supabase-js`) |
| CSV parser | papaparse |
| XLSX parser | xlsx (SheetJS) |
| Date utils | date-fns |
| Hosting | **Vercel** (`retention-dashboard-rho.vercel.app`) |

> ⚠️ This Next.js is on the 16.2 train — App Router conventions, `runtime`/`maxDuration` route segment configs and React 19's new hooks all apply. Don't assume Pages Router patterns.

---

## 3. Repository layout

```
.
├── src/
│   ├── app/
│   │   ├── layout.tsx               root layout (fonts, html shell)
│   │   ├── page.tsx                 the dashboard SPA — every tab lives here
│   │   └── api/
│   │       ├── campaigns/           GET /api/campaigns
│   │       ├── automations/         GET /api/automations
│   │       ├── automation-creatives/ POST upload xlsx + GET ?name=
│   │       ├── campaign-creatives/   POST upload xlsx + GET ?campaign_id=
│   │       ├── upload/              POST CSV ingestion (campaigns / automations)
│   │       └── sync/                POST manual Shopify UTM sync trigger
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx          left rail nav, Upload + Sync buttons
│   │   │   └── TopBar.tsx           page title + global filter row
│   │   └── ui/
│   │       ├── index.tsx            Panel/KpiCard/MetricCard/Badge/Th/Td/etc.
│   │       └── UploadModal.tsx      4-type upload dialog
│   ├── lib/
│   │   ├── supabase.ts              browser + admin (service-role) clients
│   │   ├── parser.ts                CSV parsing + name-token extraction
│   │   ├── metrics.ts               sumKey, computeKpis, computeFunnel,
│   │   │                            computeOffers, computeDaily, …
│   │   ├── store.ts                 Zustand store (data, filters, scope)
│   │   └── definitions.ts           per-tab metric definition copy
│   ├── types/index.ts               Campaign, Automation, CampaignCreative,
│   │                                AutomationCreative, GlobalFilters, …
│   └── app/globals.css              fade-in / drawer-slide-in keyframes
├── supabase-schema.sql              ← run this in Supabase SQL editor
├── .env.example                     copy to .env.local and fill in
├── package.json
└── DOCUMENTATION.md                 ← this file
```

---

## 4. Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser read access (RLS-gated) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes from API routes (bypasses RLS) |
| `KWIK_API_BASE_URL` / `KWIK_API_KEY` | Reserved for future KwikEngage live pulls |
| `SHOPIFY_STORE_DOMAIN` | `*.myshopify.com` for UTM attribution sync |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Admin API access token |
| `SHOPIFY_API_VERSION` | e.g. `2025-01` |
| `CRON_SECRET` | Shared secret for protecting scheduled cron endpoints |

The Supabase client in [`src/lib/supabase.ts`](src/lib/supabase.ts) reads these lazily — missing env doesn't crash imports, only the first call that needs the value.

---

## 5. Data model

Defined canonically in [`supabase-schema.sql`](supabase-schema.sql). Run the file once in Supabase → SQL Editor on a fresh project; migration notes inside the file cover incremental schema changes.

### Tables

#### `campaigns`
One row per **(campaign send, segment, date)**. No unique constraint on `(name, date)` — multiple rows with the same key may legitimately coexist when their metrics differ. The upload route dedups only byte-identical rows.

| Column | Notes |
| --- | --- |
| `id` | UUID PK |
| `name` | Full campaign name as exported (e.g. `C130_RET_4000<LTV_LOD_Within_540D_USP_IMG_OF-RS_LD`) |
| `campaign_id` | Parsed: first `_`-segment (e.g. `C130`) |
| `source_type` | Parsed: second `_`-segment (e.g. `RET`) |
| `segment` | Audience segment (from CSV `Source` column or fallback-parsed from name) |
| `offer` | L5 offer code only (`RS`, `B2`, `B3G1`, `OF-PL`, `LYL`, etc. — extracted dynamically). Empty for non-OFF campaigns. |
| `format` | Creative format: `IMG`, `TXT`, `VID`, `DOC`, `ICAR` |
| `channel` | `whatsapp` / `sms` / `email` |
| `date` | `DATE NOT NULL` |
| `sent`, `delivered`, `seen`, `clicks`, `buyers`, `unsubscribers`, `orders` | INTEGER |
| `sales`, `cost` | NUMERIC |
| `ctr`, `roas` | NUMERIC (nullable) |
| `source_raw` | First 1000 chars of CSV "Source" column, kept for auditing |
| `ingested_at` | TIMESTAMPTZ |

Indexes: `date`, `campaign_id`, `segment`, `offer`, composite `(name, date)`.

#### `automations`
One row per **(automation, date)**. No unique constraint — same dedup-on-byte-identical model as campaigns.

| Column | Notes |
| --- | --- |
| `name`, `channel`, `date` | Required keys |
| `type` | `standard` \| `cart_recovery` (legacy — UI no longer surfaces this split; both render under "Automations") |
| Standard metrics | `sent`, `delivered`, `seen`, `clicks`, `buyers`, `unsubscribers`, `orders`, `sales`, `cost`, `ctr`, `roas` |
| Cart-recovery extras | `recovered_amount`, `recovered_carts` |

Revenue display unifies `sales + recovered_amount` per row so cart-recovery rows don't read as zero-sales.

#### `automation_creatives`
Linked by automation name. Unique on `(automation_name, template_name)`.

| Column | Notes |
| --- | --- |
| `automation_name` | Must match an `automations.name` for lookup |
| `template_name` | Internal template identifier |
| `template_copy` | Full message body (whitespace preserved) |
| `creative_media_link` | Google Drive URL (file or folder) |

#### `campaign_creatives`
Same shape as `automation_creatives`, keyed by `campaign_id` (matches `campaigns.campaign_id`, e.g. `C123`). Also stores `channel` to disambiguate when the same code runs on multiple channels.

#### `raw_exports`
Audit log: filename, type, row_count, inserted, skipped, file_path, uploaded_at. One row per upload attempt.

#### `utm_orders`
Populated by the Shopify sync job. Holds Shopify orders matched to campaign UTMs for attribution.

### Views

`campaign_daily_summary`, `segment_summary`, `offer_summary` — convenience aggregations of `campaigns`. Useful for ad-hoc SQL but not currently consumed by the dashboard (it does aggregation client-side for filter responsiveness).

### Row-Level Security

All tables have RLS enabled with read-only policies for `anon` / `authenticated`. Writes go through API routes using the **service role key** which bypasses RLS.

---

## 6. Ingestion

### CSV uploads — `/api/upload`

Accepts a multipart form with:
- `file` — the CSV
- `type` — one of `campaigns` / `automations` (the `gokwik_carts` type still works in the backend but isn't surfaced in the UI anymore)
- `date` *or* `date_from` + `date_to` — required for automations when row-level dates aren't in the file

The route runs in the Node runtime (`maxDuration: 300s`) and batches inserts at 500 rows. Dedup model:

- **Campaigns**: fetch existing rows by `(name, date)`, skip rows byte-identical to any existing variant, insert the rest. Intra-batch duplicates are tracked so the same identical row uploaded twice in one batch only inserts once.
- **Automations**: same insert-only-with-byte-identical-dedup model.

Compare fields exclude `id`, `ingested_at`, `source_raw` (volatile to whitespace). Numeric equality uses 4-decimal rounding to absorb Postgres NUMERIC round-trip jitter.

### XLSX uploads — `/api/automation-creatives`, `/api/campaign-creatives`

SheetJS parses the first sheet. Forward-fill is applied to a blank lookup column (e.g. blank `Automation Name` inherits the previous non-blank value), matching the "merged-cells" visual intent of the spreadsheet. Upserts on the unique constraint.

### Expected file shapes

| Upload type | Required headers |
| --- | --- |
| Campaigns | `Name, Channel, Sent, Delivered, Seen, CTR, Clicks, Buyers, Unsubscribers, Sales, Orders, Source, Date, Cost, ROAS` |
| Automations | `Date, Name, Channel, Sent, Delivered, Seen, CTR, Clicks, buyers, Sales, Orders, Cost, Templates Used` (templates column is currently ignored) |
| Auto Creatives | `Automation Name, Template Name, Template Copy, Creative Media Link` |
| Camp Creatives | `Campaign ID, Channel, Template Name, Template Copy, Creative Media Link` |

---

## 7. Campaign-name parser

[`src/lib/parser.ts`](src/lib/parser.ts) is the source of truth for everything derived from a campaign name. The naming convention has multiple levels:

| Level | Meaning | Example codes |
| --- | --- | --- |
| L1 | Campaign ID | `C130`, `HTC01` |
| L2 | Source type | `RET` (retention), `WEB` |
| Segment | Audience marker | `4000<LTV`, `1000<LTV<2000`, `ATC`, `ABC`, `CNB`, `DNC`, `RNC`, `failed`, `KP=N` |
| L3 | Content theme | `BST`, `PRC`, `USP`, `VRP`, `EDU`, `UGC`, `IMW`, `OFF`, `HR` |
| Format | Creative format | `IMG`, `TXT`, `VID`, `DOC`, `ICAR` |
| L5 V1 | **Offer** (only when L3 = OFF) | `RS`, `B2`, `B3G1`, `OF-PL`, `LYL`, plus arbitrary brand codes like `RAHOSAADAA`, `SAADAA350`, `FREETOTE` |
| L5 V2 | Offer type | `PER`, `VAL`, `FRE` |

Key parser rules:

- **Offer extraction** matches any of the four prefix variants `OFF_`, `OFF-`, `OF_`, `OF-` followed by an alphanumeric code, then iterates past blacklisted tokens (format codes, themes, template versions `T1`/`T2`) until it finds a real offer.
- **`OF-PL`** is special-cased — the literal V1 code for Pre-Launch contains `OF-` itself.
- **L3 content themes are NOT offers** — they're a separate dimension. The `offer` column is empty for non-OFF campaigns.
- **Segment fallback**: if the CSV's `Source` column lacks an `Included Segment` block, the parser hunts for a segment marker (LTV bucket, ATC/ABC/CNB/…, `KP=N`, `L30D`, etc.) inside the name and slices from there up to the content-theme/format stop token. It never returns the whole name — campaigns without any detectable segment marker get `segment = ''` and group under "Other".
- All matching uses `(?:^|[_-])…(?:[_-]|$)` boundaries — never plain substring matching — to avoid false positives like `BST` hitting inside `BESTSELLER`.

---

## 8. Dashboard tabs

All tabs live in [`src/app/page.tsx`](src/app/page.tsx). Nav is defined in [`src/components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx).

### Analytics group

| Tab | Purpose |
| --- | --- |
| **Overview** | KPI grid + top-6 bar chart + messaging funnel + 8-metric strip. Has the **Campaigns ⇄ Automations** scope toggle. |
| **Campaigns** | 3-level drilldown: campaign cards → segment-category cards → row table. Each card has a "View creatives" button that slides in the creatives drawer. Row-click in the deepest level also opens the drawer. |
| **Automations** | Single table with a free-text search and sticky thead. Clicking a row slides in the creatives drawer for that automation name. KPIs unified across all rows (no Standard/Cart-Recovery split). |

### Intelligence group

| Tab | Purpose |
| --- | --- |
| **Segment Analytics** | Two-level: high-level segment categories (`0<LTV<1000`, `ATC`, `ABC`, `CNB`, …, `Other`) → drill into raw segments inside. Uses the same `SEGMENT_CATEGORIES` taxonomy as the Campaigns drilldown. Campaigns-only. |
| **Offer Analytics** | Scope toggle. Campaigns mode shows L5 offer codes (`RS`, `B2`, …). Automations mode groups by channel since automations have no offer dimension. |
| **Funnel Analysis** | Sent → Delivered → Seen → Clicks → Buyers → Orders. Best / worst delivery-rate lists. Scope-aware. |
| **Revenue & Conversion** | Revenue KPIs, top-10 by revenue-per-delivered, ROAS bucket histogram. Scope-aware. |
| **Historical Trends** | Daily sales + sent/delivered line charts and a sortable day-by-day table. Limited to the **last 15 days that have data**. |

### Scope toggle

A global `scope: 'campaigns' | 'automations'` lives in the Zustand store and drives:
- Which dataset Overview / Funnel / Revenue / Offer tabs read.
- Which filters the TopBar shows (campaigns scope → Campaign IDs / Segments / Offers; automations scope → just Date + Channel).
- Which dataset feeds the date dropdown.

Segment Analytics and the Campaigns/Automations tabs themselves ignore the global scope (they have a fixed dataset).

---

## 9. Filters

Defined in [`src/types/index.ts`](src/types/index.ts) as `GlobalFilters` and held in the store.

| Filter | Applies to |
| --- | --- |
| `date` (`'ALL' \| YYYY-MM-DD`) | Both |
| `date_from` + `date_to` | Both — mutually exclusive with `date` |
| `channel` | Both |
| `campaign_id` | Campaigns only |
| `segment` | Campaigns only |
| `offer` | Campaigns only |

Switching to automations scope or the Automations tab hides the campaign-only filters but **does not clear their values** — switch back and they reappear with their last state.

Filter changes trigger refetches via the `useEffect([filters, …])` in `DashboardPage`. Both campaigns and automations refetch on every filter change to keep them in sync.

---

## 10. Creatives drawer

Implemented as a single generic component `CreativesDrawer` in [`src/app/page.tsx`](src/app/page.tsx). Takes `label`, `sublabel`, `fetchUrl`, `onClose` and is used by both the automations name click and the campaign cards / detail rows.

- Slides in from the right (`drawer-slide-in` keyframes in `globals.css`).
- 520px wide, full-height. Table behind stays visible so you can pick another row without closing first.
- Tab strip when an automation/campaign has multiple templates.
- Top section embeds the Drive preview (`drive.google.com/file/d/<id>/preview` for files, `embeddedfolderview` for folders) — see `driveEmbedUrl`.
- Bottom section is the message copy (`<pre>` preserving whitespace).
- Esc to close, click backdrop, or X button.

---

## 11. Shopify UTM sync

[`src/app/api/sync/route.ts`](src/app/api/sync/route.ts) pulls the last 7 days of Shopify orders, parses UTM params from `landing_site`, fuzzy-matches `utm_campaign` against `campaigns.name` / `campaigns.campaign_id`, and upserts into `utm_orders`. Triggered manually via the **Sync Shopify** button in the sidebar, or by a scheduled job posting to `/api/sync` with the `CRON_SECRET`.

---

## 12. Performance notes

Multiple full-array passes per render get expensive at ~5k campaign rows. Each tab's heavy work is wrapped in a single `useMemo` that accumulates everything in **one loop**, not N independent `sumKey` calls:

- Overview: ~10 metrics computed in a single loop.
- Revenue: 7 sums + a sort fold into one loop.
- AutomationsTab: `std`/`gk` arrays memoized (legacy — no longer used after the type unification, but kept memoized in case the split returns).

Tables use internal vertical scroll (`max-h-[calc(100vh-260px)]`) with a sticky thead so headers stay pinned as the user scrolls thousands of rows.

Initial mount fetches campaigns + automations once; subsequent refetches are filter-driven only.

---

## 13. Deployment

The project deploys to **Vercel** (`retention-dashboard-rho.vercel.app`).

- Add the env vars from `.env.example` to the Vercel project's Environment Variables.
- `next.config.ts` has no special build config — defaults are fine.
- API routes that do heavy work declare `export const runtime = 'nodejs'` and `export const maxDuration = …` (300s for `/api/upload`, 120s for creatives, 60s for sync).
- Vercel cron can hit `/api/sync` on a schedule using `CRON_SECRET` for protection.

---

## 14. Operational notes & gotchas

- **Re-parsing**: changing the parser doesn't retroactively re-derive fields on rows already in the DB. Either run a targeted `UPDATE … SET offer = …` SQL, or `TRUNCATE` + re-upload to fully re-parse.
- **The first column header in some Tellephant CSV exports is the first row's data**, not literally `Name`. The parser handles this by reading by column heuristics rather than fixed names.
- **Drive preview** only works for files/folders that have link sharing enabled to "Anyone with the link can view".
- **`gokwik_carts` upload type** is no longer exposed in the UI but the route still accepts it for backward compatibility with any old automation scripts pushing to it.
- **`scope` is persisted in Zustand only in memory** — it resets to `campaigns` on full page reload.

---

## 15. Skip / TODO

Things noted but not yet built:

- Server-side pagination for `/api/campaigns` and `/api/automations` (current cap is 1000 / 10000 rows respectively via `limit` query param).
- Multi-tenant — the dashboard is hardcoded to Saadaa branding in the sidebar.
- Live KwikEngage API pull (env vars reserved, no route yet).
- Custom date presets ("Last 7 / 30 days") — currently only single date or range.

---

## 16. Local development

```bash
cp .env.example .env.local
# fill in Supabase + Shopify keys

npm install
npm run dev        # http://localhost:3000
```

To set up the database:
1. Create a Supabase project.
2. Open SQL Editor → paste `supabase-schema.sql` → Run.
3. Storage → create a bucket called `exports` (private). Optional, currently unused but reserved for raw file archival.

Linting and type-checking:
```bash
npx tsc --noEmit       # type check
npx eslint src --quiet # lint
```
