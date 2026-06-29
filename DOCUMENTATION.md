# Saadaa Retention Dashboard — Project Documentation

A self-hosted analytics dashboard for the **Saadaa** D2C retention stack. It ingests CSV/XLSX exports from KwikEngage / Tellephant / GoKwik and renders campaign, automation, segment, offer, funnel, revenue, audience and historical analytics on top of Supabase Postgres. Single-page Next.js app deployed on Vercel.

---

## 1. What it does

The marketing team runs WhatsApp / SMS / Email / RCS retention campaigns through KwikEngage and automations through KwikEngage / GoKwik. Those platforms expose per-send analytics as CSV / XLSX exports. There is no first-party dashboard that joins **campaign metadata** (segment, offer, content theme, audience), **platform metrics** (sent / delivered / clicks / buyers / sales / cost), **creative assets** (template name, copy, Drive image link), and **operational classification** (template type, status, cost) in one place.

This project is that joined view:

1. Upload a campaigns CSV → parsed, classified, deduped, merged into Supabase.
2. Upload an automations CSV → same flow, with support for both standard sales/orders and cart-recovery `Recovered Amount`/`Recovered Carts` columns.
3. Upload a creatives Excel (auto + camp) → template bodies & Drive links linked to the right automation/campaign.
4. Classify each template's **type** (Marketing / Utility / Transactional / RCS / SMS / Email / Authentication), **status** (Active / Paused / Deleted), and **per-message cost**.
5. The dashboard slices everything by **date, channel, campaign ID, segment, offer, audience (Purchaser / Non-Purchaser)** and lets you drill from a high-level overview into a single template's creative.
6. ROAS is auto-derived from per-template cost when the source CSV didn't provide one.

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
│   │   ├── layout.tsx                root layout (fonts, html shell)
│   │   ├── page.tsx                  the dashboard SPA — every tab lives here
│   │   ├── globals.css               Tailwind + animations + drawer keyframes
│   │   └── api/
│   │       ├── campaigns/            GET /api/campaigns          (merges roas ?? calculated_roas)
│   │       ├── automations/          GET /api/automations        (same merge)
│   │       ├── automation-creatives/ POST .xlsx upload + GET ?automation=
│   │       ├── campaign-creatives/   POST .xlsx upload + GET ?campaign_id=
│   │       ├── templates/            GET unified list + PATCH (type / status / cost + recalc trigger)
│   │       ├── template-type-costs/  legacy rate-card endpoint (kept for back-compat; no longer used by UI)
│   │       ├── upload/               POST campaign/automation CSV (dedup + insert + auto calculated_roas)
│   │       └── sync/                 POST trigger Shopify utm_orders sync
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           left nav, upload + sync buttons
│   │   │   └── TopBar.tsx            sticky filters (date / channel / id / segment / offer)
│   │   └── ui/
│   │       ├── UploadModal.tsx       file picker + per-type format guide + downloadable template
│   │       └── ... (Panel, MetricCard, etc.)
│   ├── lib/
│   │   ├── parser.ts                 CSV → typed rows, segment/offer extraction
│   │   ├── metrics.ts                computeFunnel / computeOffers / computeDaily / aggregateBy
│   │   ├── store.ts                  Zustand store: campaigns, automations, filters, scope
│   │   └── supabase.ts               browser + admin (service-role) clients
│   └── types/index.ts                Campaign, Automation, TemplateRow, TemplateType, etc.
├── supabase-schema.sql               canonical DDL (all tables, RLS, policies)
├── DOCUMENTATION.md                  this file
├── AGENTS.md                         agent instructions (Next.js 16.2 docs warning)
└── package.json
```

The entire dashboard SPA lives in [src/app/page.tsx](src/app/page.tsx) — every tab component, drawer, and aggregation helper. Heavy but intentional: one file, one mental model.

---

## 4. Environment

Required env vars (set in `.env.local` for dev, in Vercel project settings for prod):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only, bypasses RLS for /api routes
```

`createAdminClient()` ([src/lib/supabase.ts](src/lib/supabase.ts)) uses the service role and is **only called inside API route handlers** (`runtime = 'nodejs'`). The browser store uses the anon key and reads through PostgREST.

---

## 5. Data model

All tables live in the `public` schema. RLS is enabled with read-only `SELECT USING (true)` policies; writes are admin-only via the server-side service-role client.

### `campaigns`
One row per "campaign send observation". A campaign can have multiple rows with the same (`name`, `date`) if the metrics differ across snapshots.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `name` | TEXT | Full Tellephant campaign name (`C103_RET_4000<LTV_LOD_Within_540D_USP_IMG_OF-RAHOSAADAA_LD`) |
| `campaign_id` | TEXT | Parsed prefix (`C103`, `HTC01`, `MPC01`, etc.) |
| `source_type` | TEXT | Parsed (`RET`, `HR`, …) |
| `segment` | TEXT | Parsed from CSV `Source` column or campaign name |
| `offer` | TEXT | Parsed offer code (`RAHOSAADAA`, `SUMMER300`, `OF-PL`, …); empty when none |
| `format` | TEXT | `IMG`, `TXT`, `VID`, `DOC`, `ICAR` |
| `channel` | TEXT | `whatsapp` / `sms` / `email` / `rcs` |
| `date` | DATE | YYYY-MM-DD |
| `sent`, `delivered`, `seen`, `clicks`, `buyers`, `unsubscribers`, `orders` | INTEGER | |
| `ctr` | NUMERIC | percentage like `4.85` |
| `sales`, `cost` | NUMERIC(12,2) | INR |
| `roas` | NUMERIC(10,4) | CSV-provided ROAS; NULL if `NA`/blank in source |
| **`calculated_roas`** | NUMERIC(10,4) | **Derived** when `roas` is missing: `sales ÷ (delivered × cost_per_message_of_first_template)` |
| `source_raw` | TEXT | Raw multi-line `Source` column for debugging |
| `ingested_at` | TIMESTAMPTZ | |

No unique constraint on (`name`, `date`) — the upload route does byte-identical dedup so different metric snapshots of the same send can coexist.

### `automations`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `name` | TEXT | `Abandoned Cart`, `GK ABC - T2`, `Headless repeat users` … |
| `type` | TEXT | `standard` or `cart_recovery` (auto-detected from presence of `Recovered Amount`/`Recovered Carts` columns) |
| `channel` | TEXT | |
| `date` | DATE | required at insert; either from the CSV's Date column or the snapshot-date picker |
| `sent`, `delivered`, `seen`, `clicks`, `buyers`, `unsubscribers`, `orders` | INTEGER | |
| `ctr`, `roas`, `sales`, `cost` | NUMERIC | |
| `recovered_amount`, `recovered_carts` | NUMERIC / INT | populated for cart-recovery rows; `sales` left at 0 for those |
| **`calculated_roas`** | NUMERIC(10,4) | Same derivation; revenue = `sales + recovered_amount` |
| `ingested_at` | TIMESTAMPTZ | |

### `campaign_creatives`
One row per template within a campaign. Uploaded via .xlsx.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `campaign_id` | TEXT NOT NULL | links to `campaigns.campaign_id` |
| `channel` | TEXT | normalised lowercase |
| `template_name` | TEXT NOT NULL | |
| `template_copy` | TEXT | |
| `creative_media_link` | TEXT | Drive file or folder URL |
| **`template_type`** | TEXT | manual classification: `Marketing` / `Utility` / `Transactional` / `RCS` / `SMS` / `Email` / `Authentication` |
| **`status`** | TEXT | `Active` (default) / `Paused` / `Deleted` |
| **`cost_per_message`** | NUMERIC(10,4) | ₹ per delivered message; drives `calculated_roas` |
| `ingested_at` | TIMESTAMPTZ | |
| | | UNIQUE (`campaign_id`, `template_name`) |

### `automation_creatives`
Same shape as `campaign_creatives` but keyed by `automation_name` and unique on (`automation_name`, `template_name`).

### `template_type_costs` *(legacy)*
Per-type rate card from an earlier model. Kept in the schema but no longer read by the live code — `cost_per_message` on each creative row supersedes it. Safe to `DROP TABLE` if desired.

### `raw_exports`
Audit log of every successful upload.

| Column | |
| --- | --- |
| `id`, `filename`, `export_type`, `row_count`, `inserted`, `skipped`, `ingested_at` | |

### `utm_orders`
Shopify orders pulled by the `/api/sync` route. Holds UTM, customer, and order_value fields; powers attribution analyses not yet surfaced in the UI.

### Views
- `segment_summary` — aggregated metrics per included segment (RLS-unrestricted; for ad-hoc SQL).
- `campaign_daily_summary` — daily roll-up of campaigns.
- `offer_summary` — per-offer aggregation.

---

## 6. Ingestion pipeline

### Where parsing happens
- **Campaign / automation CSVs** → [`POST /api/upload`](src/app/api/upload/route.ts) calls `parseExport(raw, typeHint?, snapshotDate?)` from [src/lib/parser.ts](src/lib/parser.ts).
- **Creatives Excel files** → handled by their own routes: [`POST /api/automation-creatives`](src/app/api/automation-creatives/route.ts) and [`POST /api/campaign-creatives`](src/app/api/campaign-creatives/route.ts). Both use SheetJS, support **forward-fill** for blank cells (mimics merged-cell semantics), and upsert on the unique constraint.

### What the upload modal supports
The Upload Export modal ([src/components/ui/UploadModal.tsx](src/components/ui/UploadModal.tsx)) has 4 type buttons:
- **Campaigns** (CSV)
- **Automations** (CSV — supports either `Sales`/`Orders` OR `Recovered Amount`/`Recovered Carts`)
- **Auto Creatives** (XLSX)
- **Camp Creatives** (XLSX)

For each type, the modal shows:
- A collapsible **Expected format** panel listing required + optional columns, an example data row, and parser notes.
- A **⬇ Template** button that generates a real CSV/XLSX with the headers and sample rows.

### Dedup behaviour for campaigns/automations
`/api/upload` does a pre-fetch lookup batched in **80-name chunks** (avoids PostgREST's ~16KB URL limit when campaign names contain `<`, `>`, `=`). It selects the existing `(name, date)` rows and compares each new row byte-for-byte against the compare-field set:
- **Campaigns**: `campaign_id, source_type, segment, offer, format, channel, sent, delivered, seen, ctr, clicks, buyers, unsubscribers, sales, orders, cost, roas`
- **Automations**: `type, channel, date, sent, delivered, seen, ctr, clicks, buyers, unsubscribers, sales, orders, cost, roas, recovered_amount, recovered_carts`

Identical rows are skipped. Anything else is inserted, even if (`name`, `date`) already exists — multiple snapshot rows per send can coexist. Numeric equality is rounded to 4 decimals because the DB stores `NUMERIC(*,2..4)` and a CSV float like `430725.9499999996` reads back as `430725.95`.

### Auto-derived `calculated_roas` at ingest time
For every campaign/automation row being inserted where the CSV-provided `roas` is missing/blank/`NA`:
1. The upload route looks up the row's parent (`campaign_id` or `automation_name`) in the matching creatives table.
2. It picks the **first creative's `cost_per_message`** (deterministic by `ingested_at`) — a parent's templates usually share the same cost.
3. Computes `calculated_roas = revenue ÷ (delivered × cost_per_message)`, where `revenue = sales` for campaigns and `sales + recovered_amount` for automations.
4. Rows whose CSV `roas` is already present (> 0) get `calculated_roas = NULL` — CSV ROAS is never overwritten.

### Auto-recalc when a template's cost is edited
`PATCH /api/templates` ([src/app/api/templates/route.ts](src/app/api/templates/route.ts)) triggers `recalcRoasForTemplate` whenever a template's `cost_per_message` is saved. It:
1. Finds the parent (`campaign_id` or `automation_name`) for the edited template.
2. Re-reads the first creative's cost for that parent (handles the case where you edited a non-first template).
3. UPDATEs `calculated_roas` for **every campaign/automation row matching that parent AND where `roas IS NULL OR roas <= 0`**. CSV-provided ROAS rows are skipped entirely.

### `Source` column → segment extraction
Tellephant's `Source` column is multi-line text. Parser logic in `extractSegment`:
1. Look for a line containing `Included Segment` — the next non-empty line is the primary segment.
2. Else fall back to scanning the **campaign name itself** for known segment markers (`<LTV`, `KP=`, `ATC>`, `ABC`, `CNB`, `DNC`, etc.) via `fallbackSegmentFromName`.
3. Anything under `Excluded Segment` is ignored.

This prevents full campaign names from leaking into the segment column when the source doesn't carry one.

---

## 7. Campaign name parsing internals

`parseCampaignName(name)` in [src/lib/parser.ts](src/lib/parser.ts) extracts:

- **`campaign_id`** — leading prefix like `C135`, `HTC01`, `MKT02`, `MPC01`, plus full alphanumeric variants.
- **`source_type`** — second segment (`RET`, `HR`, …).
- **`format`** — first occurrence of `IMG` / `TXT` / `VID` / `DOC` / `ICAR`.
- **`offer`** — see `extractOfferCode` below.

### Offer extraction

Real-world campaign names have **two offer naming conventions**, and the parser handles both:

1. **Legacy** — `..._USP_IMG_OF-RAHOSAADAA_LD` → token after format with an `OFF_`/`OFF-`/`OF_`/`OF-` prefix.
2. **New** — `..._IMG_SUMMER300_CFY` → token after format with no prefix.

The function:
1. Special-cases the literal **Pre-Launch code** `OF-PL` (returns it as-is) so it isn't split at the dash.
2. Runs a format-anchored regex: `(?:IMG|TXT|VID|DOC|ICAR)[_-](?:(?:OFF|OF)[_-])?<code>`. Iterates all matches and skips blacklisted tokens.
3. Falls back to a legacy `OFF/OF` prefix scan anywhere in the name.

Blacklist (`NON_OFFER_CODES`):
- L3 content themes: `BST`, `PRC`, `USP`, `VRP`, `EDU`, `UGC`, `IMW`, `HR`
- L5 V2 offer types: `PER`, `VAL`, `FRE` (and any `VAL-N`, `PER-N`, `FRE-N` via a separate regex)
- Format codes: `IMG`, `TXT`, `VID`, `DOC`, `ICAR`
- Template versions: `T1`–`T6`
- Suffixes / markers: `NCL`, `CFY`, `LD`, `LFA`, `NPL`, `KWC`, `GE`, `NU`, `BC`, `VDS`, `CTG`, `MAR`, `TOTE`
- Bare prefixes: `OFF`, `OF`

Offerless campaigns are still ingested — they just don't appear in the Offer Analytics tab.

---

## 8. Tabs / UI

The dashboard ships **9 tabs** (sidebar order):

| Section | Tab | What it shows |
| --- | --- | --- |
| Analytics | Overview | KPI strip + recent-day chart for the active scope (Campaigns or Automations) |
| | Campaigns | 3-level drill: campaigns cards → segment-category cards → raw-segment rows |
| | Automations | Unified automations table (sales + recovered_amount) |
| | Templates | Per-template catalog: type, status, cost, creative link |
| Intelligence | Segment Analytics | Segment-category roll-up → raw-segment drilldown, with audience filter |
| | Offer Analytics | Per-offer revenue / ROAS / pie chart of offer mix |
| | Funnel Analysis | Sent → Delivered → Seen → Clicks → Buyers rates |
| | Revenue & Conversion | ROAS bucket distribution + top-revenue rows |
| | Historical Trends | Last 15 days of activity (sales + sent/delivered charts), with audience filter |

Tabs that read from both campaigns AND automations (Overview, Funnel, Revenue, Offer) honour the **Campaigns / Automations scope toggle** in the page header. The TopBar adapts: campaign-specific filters (Campaign IDs / Segments / Offers) hide when viewing automations.

### Filters (TopBar)

| Filter | Where it appears | Notes |
| --- | --- | --- |
| **All Dates** | always | searchable combobox; type to filter, ↑/↓ keyboard nav, click to select, ✕ to clear |
| **Date range** (from / to) | always | native `<input type="date">` |
| **All Channels** | always | small `<select>` — whatsapp / sms / email / rcs |
| **All Campaign IDs** | campaigns scope only | searchable combobox |
| **All Segments** | campaigns scope only | searchable combobox, truncates long segments |
| **All Offers** | campaigns scope only | searchable combobox |
| **Clear** | when any filter is active | red pill, resets store filters |

Each filter writes to a `GlobalFilters` object in the Zustand store; all tabs re-derive their data through `useFilteredCampaigns()` / equivalent hooks.

### Audience classification (Purchaser / Non-Purchaser)

`audienceOf(segment, name?)` in [src/app/page.tsx](src/app/page.tsx) classifies each row:
- If the **segment** is non-empty: `Non-Purchaser` iff the segment contains an `NP` token bounded by `_`/`-` (`KP=1_NP_Within_5D`, `ATC>0_NP-L90D`). Otherwise `Purchaser`.
- If the segment is empty: fall back to scanning the **name** for the same `NP` token.

Audience filter pills appear in:
- **Campaigns** drilldown (categories view) — filters cards + scope-passes through to the detail view.
- **Segment Analytics** — affects both the top-level categories and the raw-segment drilldown.
- **Historical Trends** — affects daily charts and the day-by-day table.

In each, the count of `N non-purchaser · M purchaser` is shown next to the pill so you see the overall split even when a filter is selected.

### Templates tab

[src/app/page.tsx — TemplatesTab](src/app/page.tsx) is a single unified view of all creatives from both `campaign_creatives` and `automation_creatives`. Columns:

| Column | Source / behaviour |
| --- | --- |
| Retention Type | Auto: `Campaign` (blue badge) or `Automation` (violet badge) |
| Campaign / Automation | Auto: `campaign_id` or `automation_name` |
| Template Name | Auto: monospace, truncated |
| Creative | Auto: clickable `Open ↗` if Drive link present |
| Template Type | Inline `<select>` — Marketing / Utility / Transactional / RCS / SMS / Email / Authentication. Amber-tinted if unset. |
| Status | Inline `<select>` — Active (green) / Paused (amber) / Deleted (red). |
| Cost (₹/msg) | Inline `<input type="number">`. Saves on blur or Enter; ESC reverts the draft. |

KPI cards at the top: Total / Campaign / Automation / Type Unset / Status Unset. Filter row: retention type · template type (incl. `(unset)`) · status (incl. `(unset)`) · search box.

Any cost edit fires `PATCH /api/templates` which:
1. Saves `cost_per_message` on the creative row.
2. Recalculates `calculated_roas` on all rows of the parent's campaign/automation table that don't already have a CSV ROAS (see Section 6 — Auto-recalc).

### Creatives drawer

Clicking the creatives button on a campaign / automation card opens a **right-side drawer** (CSS keyframes in `globals.css`). The drawer shows the template name, copy, and an iframe-embedded Drive preview (`drive.google.com/file/d/<id>/preview` for files, `embeddedfolderview` for folders).

---

## 9. Cost & ROAS model

### Per-template cost
Stored as `cost_per_message` (`NUMERIC(10,4)`) on each row in `campaign_creatives` / `automation_creatives`. Edit any row's cost in the Templates tab — the value persists immediately.

### Indian rate-card defaults
Used as guideline values when first populating costs. The dashboard does NOT enforce these — they're just what teams typically type in:

| Type | Rate (₹/delivered) |
| --- | --- |
| WhatsApp Marketing | 0.870 |
| WhatsApp Utility / Transactional | 0.115 |
| WhatsApp Authentication | 0 |
| WhatsApp Service | 0.040 |
| SMS | 0.115 |
| Email | 0.030 |
| RCS | 0.130 |

### ROAS resolution

| Source CSV's `roas` | What's stored | What's shown |
| --- | --- | --- |
| Has a real positive value | `roas = X`, `calculated_roas = NULL` | `X` |
| Blank / `NA` / 0 + template has cost set | `roas = NULL`, `calculated_roas = revenue ÷ (delivered × cost)` | `calculated_roas` |
| Blank / `NA` / 0 + no template cost yet | `roas = NULL`, `calculated_roas = NULL` | `—` |

API merge in [src/app/api/campaigns/route.ts](src/app/api/campaigns/route.ts) and [src/app/api/automations/route.ts](src/app/api/automations/route.ts):

```ts
const rows = (data || []).map(r => ({
  ...r,
  roas: r.roas ?? r.calculated_roas ?? null,
}))
```

All downstream UI just reads `r.roas`; both columns remain queryable in the DB.

---

## 10. Zustand store

[src/lib/store.ts](src/lib/store.ts) — a single store holds the entire client-side state.

```ts
{
  campaigns: Campaign[],
  automations: Automation[],
  filters: GlobalFilters,      // date / date_from / date_to / channel / campaign_id / segment / offer
  scope: 'campaigns' | 'automations',
  loading, fetching, ...flags,
  fetchCampaigns(), fetchAutomations(),
  setFilter(key, value), clearFilters(),
  setScope(scope),
}
```

`fetchCampaigns` and `fetchAutomations` POST to the API routes which apply the same filters server-side, so the network response is already narrowed. The store hydrates on first mount and re-fetches when any filter changes.

---

## 11. Performance

- **Server-side filtering** — every store mutation that changes a filter re-issues the API request with the filters as querystrings. The API translates them to `.eq()` / `.gte()` / `.lte()` on Postgres, so the network payload is bounded.
- **Batched lookups** during upload — dedup pre-fetches happen in 80-name chunks to stay under PostgREST's URL length limit.
- **Bucketed updates** during cost recalc — rows are grouped by computed-ROAS value so identical updates fire as a single `.update().in('id', […])` call instead of one-per-row.
- **Sticky table headers** — every long-list table uses `overflow-auto max-h-[calc(100vh-260px)]` + `position: sticky; top: 0` on the `<thead>` for cheap virtualised feel without a list virtualizer.
- **Audience-filtered scopes** are memoized (`useMemo`) per tab — switching pills doesn't refetch.

---

## 12. Deployment

- **Hosting**: Vercel project, auto-deploys from the GitHub repo's default branch.
- **Region**: closest to the Supabase project's region.
- **Route segments** use `runtime = 'nodejs'` and `maxDuration = 120-300` (uploads and recalcs are bursty).
- **Env vars** set in Vercel's project settings: same three vars listed in Section 4.

Local dev:
```bash
npm install
npm run dev     # http://localhost:3000
```

To apply schema changes:
1. Edit [supabase-schema.sql](supabase-schema.sql) in this repo.
2. Paste the relevant `ALTER TABLE` / `CREATE TABLE` statements into the Supabase SQL editor for the prod project.

---

## 13. Gotchas & known issues

- **Tellephant CSVs export NUMERIC as strings** — `toNum` handles `"NA"`, `"₹1,234.56"`, `"4.85%"`, blanks.
- **Campaign names contain regex-sensitive chars** (`<`, `>`, `=`, `,`, parens). The dedup lookup must batch in small chunks (≤80) to keep URLs under PostgREST's 16KB limit.
- **`\b` word boundary fails at underscore** — `_` is a `\w` char, so segment/audience regexes use explicit `(?:^|[_-])` boundaries.
- **Forward-fill blank cells** in creatives Excel — `parent`-name and `channel` carry over from the previous row (merged-cell semantics).
- **Drive folder embeds** require a different URL pattern than file embeds (`embeddedfolderview` vs `preview`); handled in `driveEmbedUrl`.
- **DB column type** is `NUMERIC(*,2..4)` so a CSV float `430725.9499999996` reads back as `430725.95`. `rowsIdentical` rounds to 4 decimals before comparison.
- **`type` field on automations** is auto-detected from CSV columns: rows with `Recovered Amount > 0` or `Recovered Carts > 0` become `cart_recovery`, everything else `standard`. The UI does NOT bifurcate by this field; both are shown together in the Automations tab.

---

## 14. Common workflows

**Onboard a fresh tenant from zero**
1. Run `supabase-schema.sql` against the Supabase project.
2. Set env vars in Vercel, deploy.
3. Upload campaigns CSV → automations CSV → auto creatives → camp creatives.
4. In Templates tab: classify each template's type, set status, fill cost.
5. As you fill costs, ROAS auto-fills on existing rows that lacked CSV ROAS.

**Add a new template type or status**
- Edit `TEMPLATE_TYPES` / `TEMPLATE_STATUSES` in [src/app/page.tsx](src/app/page.tsx) and the `VALID_TYPES` set in API routes. No DB schema change needed since these are TEXT columns.

**Wipe a table for re-upload**
```sql
TRUNCATE TABLE campaigns;          -- preserves creatives + classifications
TRUNCATE TABLE automations;
TRUNCATE TABLE raw_exports;        -- optional, clears upload audit log
```

**Spot-check ROAS source per row**
```sql
SELECT name, date, roas, calculated_roas,
       COALESCE(roas, calculated_roas) AS display_roas
FROM campaigns
WHERE campaign_id = 'C135'
ORDER BY date DESC;
```

**Find templates without a cost set**
```sql
SELECT campaign_id, template_name FROM campaign_creatives WHERE cost_per_message IS NULL
UNION ALL
SELECT automation_name, template_name FROM automation_creatives WHERE cost_per_message IS NULL;
```

---

## 15. Future work / not built

- **Recalc-all endpoint** — currently recalc fires per-template on cost edit. A "recalc everything" button would help if you bulk-edit costs via SQL.
- **Audience filter on Overview / Funnel / Revenue / Offer tabs** — already supported on Segment / Historical / Campaigns drilldown.
- **Multi-cost-per-template** — currently the first template's cost wins when a campaign has multiple templates. A weighted cost (per template_sent fraction) would be more accurate but requires per-template send counts (not in current CSVs).
- **Shopify utm_orders attribution UI** — table exists, sync route works, no tab surfaces it yet.
- **Export filtered rows** — the dashboard reads but doesn't write back to CSV. Nice-to-have if marketing wants to pull a filtered slice into Sheets.

---

## 16. Key files cheat-sheet

| To change… | Edit… |
| --- | --- |
| Campaign name parsing | `src/lib/parser.ts` → `parseCampaignName`, `extractOfferCode`, `fallbackSegmentFromName` |
| Segment category buckets | `src/app/page.tsx` → `SEGMENT_CATEGORIES`, `categorize()` |
| Audience classification | `src/app/page.tsx` → `audienceOf()`, `NP_TOKEN_RE` |
| Upload dedup behaviour | `src/app/api/upload/route.ts` → `CAMPAIGN_COMPARE_FIELDS`, `BATCH_SIZE`, `LOOKUP_CHUNK` |
| Per-template cost UI | `src/app/page.tsx` → `TemplatesTab` |
| ROAS recalc on cost save | `src/app/api/templates/route.ts` → `recalcRoasForTemplate` |
| ROAS at ingest time | `src/app/api/upload/route.ts` (search `calculated_roas`) |
| Filter dropdown UX | `src/components/layout/TopBar.tsx` → `SearchableSelect` |
| Sidebar nav | `src/components/layout/Sidebar.tsx` → `NAV` array |
| Upload modal format guide | `src/components/ui/UploadModal.tsx` → `FORMAT_SPECS` |
