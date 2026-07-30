# Saadaa Retention Dashboard — Codex Context

Concentrated context for AI code assistants. Read once, then work directly. Sections are ordered by "how likely you need to touch this".

---

## 0. Meta

- **Repo**: `d:\saadaa-rip\Retention-Dashboard`
- **Deploy**: Vercel → `https://retention-dashboard-rho.vercel.app`
- **DB**: Supabase Postgres (multi-tenant service, this is one project)
- **Owner**: Saadaa D2C retention team; primary user `website@saadaa.in`
- **Model of app**: Single-page dashboard, ingests marketing CSVs, renders analytics

## 1. Read this first — critical warnings

1. **Next.js 16.2**, not 14/15. App Router only. React 19.2. Any suggestion using Pages Router, `getServerSideProps`, or React < 19 hooks is wrong for this codebase. Route segment configs like `export const runtime = 'nodejs'` and `export const maxDuration = 120` are used.
2. **Zustand 5**, not Redux / React Context / server state libraries. All client state lives in `src/lib/store.ts`.
3. **Tailwind CSS 4**, uses the new PostCSS pipeline. No `tailwind.config.js` — config is CSS-native in `globals.css`.
4. **The entire SPA is one file** — [src/app/page.tsx](src/app/page.tsx) is ~1600 lines and holds every tab as a function component. This is intentional. Do NOT split tabs into files without explicit request.
5. **No pgvector / no ORM** — plain `@supabase/supabase-js`. Queries use `.from().select().eq()...`, not raw SQL, unless doing bulk `execute_sql`.
6. **RLS is on for all tables**, service-role bypasses it. `createAdminClient()` is the server-side factory; client-side uses anon key. Never expose the service role key.
7. **Only emojis if user asks**. No trailing whitespace changes. No docstrings for JS/TS beyond one-line WHY comments.

## 2. Purpose in 3 sentences

Marketing team runs campaigns on KwikEngage/Tellephant/GoKwik and exports CSVs. This dashboard unifies those exports with creative assets (templates + Drive images) and manual classification (template type, cost, status). It slices campaigns/automations by date, channel, segment, offer, audience, and derives ROAS from per-template cost when the source CSV doesn't provide one.

## 3. Directory layout

```
src/app/
  page.tsx                    ← ALL tabs live here (~1600 LOC)
  layout.tsx                  root layout
  globals.css                 Tailwind + drawer keyframes
  api/
    campaigns/route.ts        GET  /api/campaigns  (merges roas ?? calculated_roas)
    automations/route.ts      GET  /api/automations
    templates/route.ts        GET unified templates + PATCH (type/status/cost + recalc)
    template-type-costs/      LEGACY — kept for back-compat; do not extend
    automation-creatives/     POST xlsx + GET ?automation=
    campaign-creatives/       POST xlsx + GET ?campaign_id=
    upload/route.ts           POST campaigns/automations CSV (dedup + calculated_roas)
    sync/route.ts             POST Shopify utm_orders sync

src/lib/
  parser.ts                   CSV parsing + name/segment/offer extraction
  metrics.ts                  computeFunnel, computeOffers, computeDaily, aggregateBy
  store.ts                    Zustand store — campaigns, automations, filters, scope
  supabase.ts                 createAdminClient() + createBrowserClient()

src/components/
  layout/
    Sidebar.tsx               Left nav; NAV array defines tabs
    TopBar.tsx                Sticky filter bar + SearchableSelect combobox
  ui/
    UploadModal.tsx           File picker + per-type format guide + template download

src/types/index.ts            Campaign, Automation, TemplateRow, TemplateType, ExportType

supabase-schema.sql           Canonical DDL — RLS, policies, tables, views
DOCUMENTATION.md              Human-oriented docs
CONTEXT.md                    This file
AGENTS.md                     "Read node_modules/next/dist/docs before writing Next.js code"
CLAUDE.md                     @-includes AGENTS.md
```

## 4. Data model

### Tables

```sql
campaigns (
  id UUID PK, name TEXT, campaign_id TEXT, source_type TEXT,
  segment TEXT, offer TEXT, format TEXT, channel TEXT,
  date DATE, sent INT, delivered INT, seen INT, ctr NUMERIC, clicks INT,
  buyers INT, unsubscribers INT, sales NUMERIC(12,2), orders INT,
  cost NUMERIC(12,2), roas NUMERIC(10,4),
  calculated_roas NUMERIC(10,4),   -- derived when roas is missing
  source_raw TEXT, ingested_at TIMESTAMPTZ
)
-- NO unique constraint. Multiple snapshots per (name,date) allowed.

automations (
  id UUID PK, name TEXT, type TEXT,  -- 'standard' | 'cart_recovery'
  channel TEXT, date DATE, sent INT, delivered INT, seen INT,
  ctr NUMERIC, clicks INT, buyers INT, unsubscribers INT,
  sales NUMERIC, orders INT, cost NUMERIC, roas NUMERIC(10,4),
  recovered_amount NUMERIC, recovered_carts INT,
  calculated_roas NUMERIC(10,4),
  ingested_at TIMESTAMPTZ
)

campaign_creatives (
  id UUID PK, campaign_id TEXT, channel TEXT,
  template_name TEXT, template_copy TEXT, creative_media_link TEXT,
  template_type TEXT,              -- Marketing/Utility/Transactional/RCS/SMS/Email/Authentication
  status TEXT DEFAULT 'Active',    -- Active/Paused/Deleted
  cost_per_message NUMERIC(10,4),  -- ₹ per delivered message
  ingested_at TIMESTAMPTZ,
  UNIQUE (campaign_id, template_name)
)

automation_creatives (
  -- same shape, keyed by automation_name
  UNIQUE (automation_name, template_name)
)

template_type_costs   -- LEGACY, not read anywhere; safe to drop
raw_exports           -- audit log per upload
utm_orders            -- Shopify sync target; not surfaced in UI yet
```

### TypeScript types ([src/types/index.ts](src/types/index.ts))

```ts
export type Channel = 'whatsapp' | 'email' | 'sms'  // 'rcs' exists in DB but not this union yet

export interface Campaign {
  id: string; name: string; campaign_id: string; source_type: string
  segment: string; offer: string; format: string; channel: Channel
  date: string  // YYYY-MM-DD
  sent: number; delivered: number; seen: number
  ctr: number | null; clicks: number; buyers: number
  unsubscribers: number; sales: number; orders: number
  cost: number; roas: number | null
  source_raw: string; ingested_at: string
}

export interface Automation {
  id: string; name: string; type: 'standard' | 'cart_recovery'
  channel: Channel; date: string | null
  // ... same metric fields as Campaign
  recovered_amount: number; recovered_carts: number
  ingested_at: string
}

export type TemplateType = 'Utility' | 'Marketing' | 'Transactional' | 'RCS' | 'SMS' | 'Email' | 'Authentication'
export type TemplateStatus = 'Active' | 'Paused' | 'Deleted'

export interface TemplateRow {
  id: string
  retention_type: 'Campaign' | 'Automation'
  source_table: 'campaign_creatives' | 'automation_creatives'
  parent_name: string          // campaign_id or automation_name
  template_name: string; template_copy: string | null
  creative_media_link: string | null
  template_type: TemplateType | null
  status: TemplateStatus | null
  cost_per_message: number | null
}
```

## 5. API surface

All routes are Next.js App Router `route.ts` handlers. Return `NextResponse.json()`. All server routes use `runtime = 'nodejs'`.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/campaigns` | `?date=&campaign_id=&segment=&offer=&channel=&date_from=&date_to=&limit=` | `{ data: Campaign[], count }` — `roas` merged from `roas ?? calculated_roas` |
| GET | `/api/automations` | `?type=&channel=&date=&date_from=&date_to=` | `{ data: Automation[], count }` — same merge |
| POST | `/api/upload` | multipart form: `file` (CSV), `type` (ExportType), `date`?, `date_from`?, `date_to`? | `{ success, inserted, updated, skipped, errors[], export_type }` |
| POST | `/api/automation-creatives` | multipart: `file` (xlsx) | `{ success, inserted, updated, skipped }` |
| POST | `/api/campaign-creatives` | multipart: `file` (xlsx) | same |
| GET | `/api/templates` | none | `{ data: TemplateRow[], count }` |
| PATCH | `/api/templates` | `{ source_table, id, template_type?, status?, cost_per_message? }` | `{ ok: true, recalc?: { updated: N } }` |
| POST | `/api/sync` | none | triggers Shopify sync into `utm_orders` |

Critical merge pattern in campaigns/automations GET:
```ts
const rows = (data || []).map(r => ({
  ...r,
  roas: r.roas ?? r.calculated_roas ?? null,
}))
```

## 6. State (Zustand)

`src/lib/store.ts`:

```ts
export type DataScope = 'campaigns' | 'automations'

interface GlobalFilters {
  date: string;         // 'ALL' | 'YYYY-MM-DD'
  date_from: string;    // '' | 'YYYY-MM-DD'
  date_to: string;
  channel: string;      // 'ALL' | 'whatsapp' | ...
  campaign_id: string;
  segment: string;
  offer: string;
}

interface DashStore {
  campaigns: Campaign[]
  automations: Automation[]
  filters: GlobalFilters
  scope: DataScope
  loading: boolean; fetching: boolean
  fetchCampaigns(): Promise<void>
  fetchAutomations(): Promise<void>
  setFilter(key: keyof GlobalFilters, value: string): void
  clearFilters(): void
  setScope(scope: DataScope): void
}

export const useDashStore = create<DashStore>(...)
```

Usage in components: `const campaigns = useDashStore(s => s.campaigns)`. Filter changes trigger re-fetches internally.

## 7. Parser & campaign name conventions

`src/lib/parser.ts` exports:

```ts
parseExport(raw: string, hint?: ExportType, snapshotDate?: string | null): { type, data }
parseCampaignName(name: string): { campaign_id, source_type, offer, format }
extractSegment(source: string, name: string): string
```

### Campaign name shape

Two conventions, both handled:

```
LEGACY:  C103_RET_4000<LTV_LOD_Within_540D_notwithin_330D_USP_IMG_OF-RAHOSAADAA_LD
NEW:     C135_RET_WA_ATC>1_P-L30D_IMG_SUMMER300_CFY
```

Fields:
- `C103` / `C135` — `campaign_id`
- `RET` — `source_type`
- `USP` (legacy) / (absent) — content theme (blacklisted from offer)
- `IMG` — `format`
- `OF-RAHOSAADAA` / `SUMMER300` — `offer` (with-prefix and no-prefix both valid)
- `LD` / `CFY` — suffix (blacklisted from offer)

### Offer extraction rules

1. Special-case Pre-Launch literal `OF-PL` first
2. Regex: `(?:^|[_-])(?:IMG|TXT|VID|DOC|ICAR)[_-](?:(?:OFF|OF)[_-])?([A-Za-z][A-Za-z0-9-]*)(?=_|$)`
3. Iterate matches, skip blacklisted `NON_OFFER_CODES`
4. Skip V2 types via `isV2OfferType()` regex `^(?:VAL|PER|FRE)(?:-|$)`
5. Fallback: OFF/OF prefix scan anywhere in name

### `NON_OFFER_CODES` blacklist

```ts
['BST','PRC','USP','VRP','EDU','UGC','IMW','HR',       // L3 content themes
 'PER','VAL','FRE',                                       // L5 V2 types
 'IMG','TXT','VID','DOC','ICAR',                          // formats
 'T1','T2','T3','T4','T5','T6',                           // template versions
 'NCL','CFY','LD','LFA','NPL','KWC','GE','NU','BC','VDS','CTG','MAR','TOTE',  // suffixes
 'OFF','OF']                                              // bare prefixes
```

### Segment extraction

`Source` column in the CSV is multi-line:
```
segment - Included Segment
CNB_RCS_30052026
Excluded Segment
ATC>0_NP-L30D
```
Take the line **after** `Included Segment`. Ignore everything under `Excluded Segment`. If no `Included Segment` header, fall back to `fallbackSegmentFromName(name)` which scans the campaign name for `<LTV`, `KP=`, `ATC>`, `ABC`, `CNB`, `DNC` markers.

### `\b` boundary bug

`\b` fails at `_` because `_` is a `\w` char. All segment/audience regexes use explicit `(?:^|[_-])` boundaries.

## 8. Ingestion pipeline

### `POST /api/upload` flow

1. Read `file`, `type`, `date`, `date_from`, `date_to` from FormData
2. `parseExport(raw, type, snapshotDate)` → `{ type, data: rows }`
3. **Auto-derive `calculated_roas`** for rows where CSV `roas` is missing:
   - Build parent → `cost_per_message` map from creatives table (first cost by `ingested_at`)
   - For each row: if `r.roas > 0`, set `calculated_roas = null` (don't overwrite)
   - Else: `calculated_roas = revenue / (delivered * cost_per_message)` where revenue = `sales` for campaigns, `sales + recovered_amount` for automations
4. Dedup lookup in **80-name chunks** (PostgREST URL length limit — names contain `<`, `>`, `=`, `,` and are 60-80 chars):
   ```ts
   const LOOKUP_CHUNK = 80
   // Not: .in('name', allNames).in('date', allDates) — that hits ~16KB URL
   ```
5. Compare each new row byte-identically against existing rows for its (`name`, `date`) using `CAMPAIGN_COMPARE_FIELDS` / `AUTOMATION_COMPARE_FIELDS`. Numeric equality rounded to 4 decimals.
6. Insert non-duplicates in `BATCH_SIZE = 500` chunks.
7. Log to `raw_exports`.

### `PATCH /api/templates` recalc

When `cost_per_message` changes:
1. Look up template's parent (`campaign_id` or `automation_name`)
2. Get **first creative's** cost for that parent (deterministic by `ingested_at`)
3. Fetch all `campaigns`/`automations` rows for that parent **WHERE `roas IS NULL OR roas <= 0`** — CSV ROAS rows are skipped
4. Compute new `calculated_roas`
5. Bucket by value, UPDATE `.in('id', […])` per bucket to minimize round-trips

Reference: [src/app/api/templates/route.ts](src/app/api/templates/route.ts) → `recalcRoasForTemplate`

## 9. UI conventions

### Sidebar tabs (`src/components/layout/Sidebar.tsx`)

```ts
export type TabId =
  | 'overview' | 'campaigns' | 'automations' | 'templates'
  | 'segment' | 'offer' | 'funnel' | 'revenue' | 'historical'
```

Add a new tab: extend `TabId`, add to `NAV`, add to `tabs` object in `page.tsx`.

### Scope-aware tabs

Tabs `overview`, `offer`, `funnel`, `revenue` honor a Campaigns/Automations scope toggle. Others don't.

```ts
const SCOPE_AWARE_TABS = new Set(['overview', 'offer', 'funnel', 'revenue'])
```

`viewingAutomations = tab === 'automations' || (SCOPE_AWARE_TABS.has(tab) && scope === 'automations')`

### Filter combobox

`SearchableSelect` in `TopBar.tsx` — controlled by `useDashStore().filters`. Keyboard: `↑/↓` navigate, `Enter` select, `Esc` close.

### Audience filter

Purchaser/Non-Purchaser filter present on: Campaigns drilldown, Segment Analytics, Historical Trends.

```ts
const NP_TOKEN_RE = /(?:^|[_-])NP(?=[_-]|$)/i

function audienceOf(segment: string, name?: string): 'Non-Purchaser' | 'Purchaser' {
  if (segment) return NP_TOKEN_RE.test(segment) ? 'Non-Purchaser' : 'Purchaser'
  if (name && NP_TOKEN_RE.test(name)) return 'Non-Purchaser'
  return 'Purchaser'
}
```

Segment wins over name — do NOT flip this order.

### Sticky headers

Every long list uses this pattern:
```tsx
<div className="overflow-auto max-h-[calc(100vh-260px)]">
  <table>
    <thead className="bg-gray-50 sticky top-0 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
      ...
    </thead>
    <tbody>...</tbody>
  </table>
</div>
```

### Templates tab

Columns: `Retention Type | Campaign/Automation | Template Name | Creative | Template Type | Status | Cost (₹/msg)`.

- Template type & status: inline `<select>`, saves on change
- Cost: inline `<input type="number">`, saves on blur or Enter
- Filter pills at top: retention type, template type (incl. `(unset)`), status (incl. `(unset)`), search
- KPI cards: Total / Campaign / Automation / Type Unset / Status Unset

Save states shown as `…`/`✓`/`✗` next to the field.

## 10. Cost & ROAS model

- Cost is stored **per template** in `cost_per_message` (`campaign_creatives.cost_per_message`, `automation_creatives.cost_per_message`)
- When a template's cost changes, `calculated_roas` on all matching campaigns/automations rows is recomputed — but ONLY where `roas IS NULL OR roas <= 0` (CSV ROAS is sacred)
- Display uses `roas ?? calculated_roas` — merged in the API GET layer, not in components
- Indian defaults (guideline only, not enforced): Marketing 0.870, Utility/Transactional 0.115, Auth 0, SMS 0.115, Email 0.030, RCS 0.130

## 11. Format specs (upload modal)

`src/components/ui/UploadModal.tsx` → `FORMAT_SPECS: Record<ExportType, FormatSpec>`. Each entry has:
- `ext`: `.csv` or `.xlsx / .xls`
- `required`: string[] of column headers
- `optional`?: string[]
- `example`: `string[][]` — header row + sample data rows
- `notes`: string[] of parser gotchas

Template download button synthesizes a real CSV or XLSX from these specs.

## 12. Common tasks

### Add a column to `campaigns`

1. `ALTER TABLE campaigns ADD COLUMN foo TEXT;` in `supabase-schema.sql` AND in Supabase SQL editor
2. Add field to `Campaign` interface in `src/types/index.ts`
3. Parse it in `parseCampaignsCSV()` in `src/lib/parser.ts`
4. Reference it wherever needed in `page.tsx`
5. If it needs to be filtered on: add to `GlobalFilters` in store, add to TopBar

### Add a new tab

1. Extend `TabId` union and `NAV` array in `Sidebar.tsx`
2. Add `PAGE_TITLES[newTab]` in `TopBar.tsx`
3. Write `function NewTab()` in `page.tsx`
4. Register in `tabs` object

### Add a new template classification

Edit `TEMPLATE_TYPES` or `TEMPLATE_STATUSES` in `page.tsx` AND `VALID_TYPES` (or equivalent) in `src/app/api/templates/route.ts`. No DB schema change needed — columns are TEXT.

### Wipe & reload

```sql
TRUNCATE TABLE campaigns;
TRUNCATE TABLE automations;
-- Creatives + classifications + costs are preserved
```

Then re-upload CSVs through the dashboard.

## 13. Anti-patterns — do NOT do

1. **Do not create new tab files.** All tabs stay in `page.tsx`.
2. **Do not modify the `roas` column** on campaigns/automations. It's the CSV source of truth. Only touch `calculated_roas`.
3. **Do not use `.in('name', names).in('date', dates)` with > 80 names.** URL length limit will 400. Use the `fetchExistingInChunks` helper pattern.
4. **Do not use `\b`** in regexes that need to match around `_`. Use `(?:^|[_-])` and `(?=[_-]|$)`.
5. **Do not add unique constraints** on `(name, date)` for campaigns/automations. Multiple snapshots per key is a feature.
6. **Do not remove the two-pass segment extraction.** The fallback from `Included Segment` line to name-based marker scanning prevents raw campaign names from leaking into the segment column.
7. **Do not blindly recompute ROAS for all rows** when a cost changes. The recalc must filter `WHERE roas IS NULL OR roas <= 0`.
8. **Do not add emojis, JSDoc blocks, or trailing summary paragraphs** to code files. WHY-only one-line comments.
9. **Do not use `getServerSideProps` / Pages Router patterns**. This is App Router.
10. **Do not switch offer parsing to a simple regex** — the two-format handling (with and without OFF prefix) plus blacklists is required.
11. **Do not overwrite user's per-template cost when they upload a new creatives xlsx.** The upload uses `upsert(rows, { onConflict: '...' })` and the parseCreativesWorkbook does NOT emit `cost_per_message`, so upsert leaves the column as-is. If you refactor upload, preserve this behavior.

## 14. Common gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| Upload "Bad Request" on lookup batch | PostgREST URL > 16 KB from long names in `.in()` | Use `fetchExistingInChunks` with chunk size ≤ 80 |
| ROAS shows as "—" but CSV had value | Value was `"NA"` or `0` — parsed as null | Check `toNullNum` in parser; treats `NA`/`N/A`/empty as null |
| Numeric compare fails on identical rows | Float precision (`430725.9499999996` vs stored `430725.95`) | `rowsIdentical` rounds to 4 decimals before compare |
| Segment shows full campaign name | Fallback extractor found a marker in the name, or a raw line was returned | Check `SEGMENT_MARKER` regex and `fallbackSegmentFromName` |
| Templates show `(unset)` after xlsx upload | Xlsx doesn't set `template_type` — only manual classification does | This is by design; upload only sets `template_name/copy/link` |
| Cost change doesn't affect a row | That row has a CSV `roas > 0`, so recalc skips it | Correct behavior — CSV is sacred |
| `\b` regex not matching in segment | `_` is a `\w` char | Use `(?:^|[_-])` boundaries |
| Sidebar tab shows blank content | Missing entry in `tabs` object in `page.tsx` | Add `newTab: <NewTabComponent/>` |
| Automation cost = 0 in DB but display shows number | `calculated_roas` filled from template cost; display merges | Check `roas ?? calculated_roas` — behavior is intended |

## 15. Data flow (text diagram)

```
CSV upload:
  file → parseExport (parser.ts)
    → normalize numeric strings ("NA" → null, "4.85%" → 4.85)
    → parseCampaignName / extractSegment
    → [rows]
  ↓
  Enrich: fetch parent → cost_per_message from creatives table
    → compute calculated_roas where roas is null
  ↓
  Dedup: fetch existing (name,date) rows in 80-name chunks
    → byte-identical compare vs CAMPAIGN_COMPARE_FIELDS
    → skip identical, insert rest in 500-row batches
  ↓
  Supabase: campaigns / automations table

Cost edit (Templates tab):
  onChange → PATCH /api/templates
    → UPDATE creatives.cost_per_message
    → recalcRoasForTemplate:
        - find parent's first-cost by ingested_at
        - SELECT id, delivered, sales, [recovered_amount]
          FROM {campaigns|automations}
          WHERE parent = parent_name
            AND (roas IS NULL OR roas <= 0)
        - bucket by computed roas, UPDATE .in('id', […]) per bucket
  ↓
  UI store next fetch cycle sees updated calculated_roas

Read (any tab):
  useDashStore().campaigns
    ← GET /api/campaigns?filters
      ← SELECT * FROM campaigns WHERE filters
      → map(r => ({ ...r, roas: r.roas ?? r.calculated_roas ?? null }))
    ← store.setCampaigns
  ↓
  Tab component uses r.roas (already merged)
```

## 16. Env vars

```
NEXT_PUBLIC_SUPABASE_URL         # both client and server
NEXT_PUBLIC_SUPABASE_ANON_KEY    # client only, RLS-restricted reads
SUPABASE_SERVICE_ROLE_KEY        # server-only, bypasses RLS in API routes
```

`createAdminClient()` reads `SUPABASE_SERVICE_ROLE_KEY` — only usable in `route.ts` files.

## 17. Testing / running locally

```bash
npm install
npm run dev              # http://localhost:3000
npx tsc --noEmit         # type check (nothing else — no test suite)
```

No Vitest / Jest / Playwright. Verification is done by uploading a real CSV in dev and eyeballing the tables. When testing DB queries, always use the Supabase SQL editor via the tools; don't add ad-hoc test scripts.

## 18. Frequently referenced constants

| Constant | Where | Value |
| --- | --- | --- |
| `BATCH_SIZE` | `upload/route.ts` | 500 |
| `LOOKUP_CHUNK` | `upload/route.ts` | 80 (PostgREST URL length safety) |
| `CAMPAIGN_COMPARE_FIELDS` | `upload/route.ts` | Compare set for dedup |
| `AUTOMATION_COMPARE_FIELDS` | `upload/route.ts` | Compare set for dedup |
| `TEMPLATE_TYPES` | `page.tsx` | 7 types |
| `TEMPLATE_STATUSES` | `page.tsx` | Active / Paused / Deleted |
| `SEGMENT_CATEGORIES` | `page.tsx` | Segment bucket enum |
| `NON_OFFER_CODES` | `parser.ts` | Offer extraction blacklist |
| `NP_TOKEN_RE` | `page.tsx` | `/(?:^|[_-])NP(?=[_-]|$)/i` |
| `SCOPE_AWARE_TABS` | `TopBar.tsx` | `{overview,offer,funnel,revenue}` |

## 19. What's NOT built (do not attempt without asking)

- Bulk cost recalculation across all templates (per-template recalc exists, but not a global "recompute everything" button)
- Audience filter on Overview / Funnel / Revenue / Offer tabs
- CSV export from any tab
- UTM attribution UI (`utm_orders` table exists but no reader)
- Multi-tenant support (this is single-tenant, single-Supabase-project)
- Auth / user login (unauthenticated, public dashboard)
- Real-time updates / websockets
- Server-rendered pages (everything is CSR after initial load)

---

If asked to implement anything above, first confirm scope, then check what data source it needs (usually `utm_orders` or manual entry), then propose an approach before coding.
