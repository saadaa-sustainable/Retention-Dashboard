# Changelog

All notable changes to the Saadaa Retention Dashboard (KwikEngage) are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes yet._

## [0.1.0] — 2026-07-21

Baseline entry documenting the current state of the project. This captures what
exists today rather than reconstructing a per-change history.

### Added

- **Next.js 16.2 App Router SPA** (React 19.2, TypeScript 5, Tailwind CSS 4). The
  entire dashboard renders from a single client component tree in
  `src/app/page.tsx`.
- **Analytics tabs**: Overview, Campaigns, Automations, Templates.
- **Intelligence tabs**: Segment Analytics, Offer Analytics, Funnel Analysis,
  Revenue & Conversion, Historical Trends.
- **Campaign drill-down**: campaign-ID cards → segment-category view → detail rows,
  with an audience toggle (Purchaser / Non-Purchaser) derived from campaign-name /
  segment tokens.
- **Creatives drawer**: per-campaign / per-automation template copy and embedded
  Google Drive media preview.
- **CSV ingestion** (`POST /api/upload`): header auto-detection
  (`campaigns` / `automations` / `gokwik_carts`), campaign-name parsing into
  `campaign_id` / `source_type` / `offer` / `format` / `segment`, chunked
  byte-identical dedup, and per-row `calculated_roas` derived from template
  `cost_per_message`.
- **Creatives upload** (`.xlsx`) for campaign and automation templates, with manual
  `template_type` / `status` classification and per-message cost.
- **Shopify UTM attribution sync** (`/api/sync`): manual (POST) and cron-guarded
  (GET + `CRON_SECRET`) modes populating `utm_orders`.
- **Read API routes** (`/api/campaigns`, `/api/automations`) with global filters
  (date, date range, channel, campaign, segment, offer) surfacing
  `roas ?? calculated_roas`.
- **Zustand store** (`src/lib/store.ts`) for data, filters, and campaigns/automations
  scope; pure metric helpers in `src/lib/metrics.ts`.
- **Supabase schema** (`supabase-schema.sql`): `campaigns`, `automations`,
  `automation_creatives`, `campaign_creatives`, `template_type_costs`,
  `raw_exports`, `utm_orders` tables; `campaign_daily_summary`, `segment_summary`,
  `offer_summary` views; indexes; and read-only RLS policies (writes via service
  role only).

[Unreleased]: #unreleased
[0.1.0]: #010--2026-07-21
