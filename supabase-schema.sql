-- ============================================================
-- KwikEngage Retention Dashboard — Supabase Schema
-- Run this entire file in: Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  campaign_id     TEXT NOT NULL,          -- C130, HTC01, MPC01 …
  source_type     TEXT,                   -- RET, WEB …
  segment         TEXT NOT NULL,          -- included segment name
  offer           TEXT,                   -- USP, COD, POLL …
  format          TEXT,                   -- IMG, TXT, VID …
  channel         TEXT NOT NULL DEFAULT 'whatsapp',
  date            DATE NOT NULL,
  sent            INTEGER NOT NULL DEFAULT 0,
  delivered       INTEGER NOT NULL DEFAULT 0,
  seen            INTEGER NOT NULL DEFAULT 0,
  ctr             NUMERIC(8,4),
  clicks          INTEGER NOT NULL DEFAULT 0,
  buyers          INTEGER NOT NULL DEFAULT 0,
  unsubscribers   INTEGER NOT NULL DEFAULT 0,
  sales           NUMERIC(14,2) NOT NULL DEFAULT 0,
  orders          INTEGER NOT NULL DEFAULT 0,
  cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas            NUMERIC(10,4),
  source_raw      TEXT,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- prevent duplicate ingestion of same campaign+date
  CONSTRAINT campaigns_name_date_unique UNIQUE (name, date)
);

-- ── automations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL UNIQUE,   -- automation name is unique
  type              TEXT NOT NULL DEFAULT 'standard', -- standard | cart_recovery
  channel           TEXT NOT NULL DEFAULT 'whatsapp',
  sent              INTEGER NOT NULL DEFAULT 0,
  delivered         INTEGER NOT NULL DEFAULT 0,
  seen              INTEGER NOT NULL DEFAULT 0,
  ctr               NUMERIC(8,4),
  clicks            INTEGER NOT NULL DEFAULT 0,
  buyers            INTEGER NOT NULL DEFAULT 0,
  unsubscribers     INTEGER NOT NULL DEFAULT 0,
  sales             NUMERIC(14,2) NOT NULL DEFAULT 0,
  orders            INTEGER NOT NULL DEFAULT 0,
  cost              NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas              NUMERIC(10,4),
  recovered_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  recovered_carts   INTEGER NOT NULL DEFAULT 0,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── raw_exports ────────────────────────────────────────────────────────────
-- Stores every uploaded CSV file for audit / re-ingestion
CREATE TABLE IF NOT EXISTS raw_exports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename     TEXT NOT NULL,
  export_type  TEXT NOT NULL,   -- campaigns | automations | gokwik_carts
  row_count    INTEGER,
  inserted     INTEGER,
  skipped      INTEGER,
  file_path    TEXT,            -- Supabase Storage path
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── utm_orders ─────────────────────────────────────────────────────────────
-- Populated by Shopify attribution sync
CREATE TABLE IF NOT EXISTS utm_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_order_id  TEXT NOT NULL UNIQUE,
  order_number      TEXT,
  total_price       NUMERIC(12,2),
  created_at        TIMESTAMPTZ,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_content       TEXT,
  utm_term          TEXT,
  campaign_name     TEXT,   -- matched to campaigns.name
  campaign_id       TEXT,   -- matched to campaigns.campaign_id
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS campaigns_date_idx        ON campaigns (date);
CREATE INDEX IF NOT EXISTS campaigns_campaign_id_idx ON campaigns (campaign_id);
CREATE INDEX IF NOT EXISTS campaigns_segment_idx     ON campaigns (segment);
CREATE INDEX IF NOT EXISTS campaigns_offer_idx       ON campaigns (offer);
CREATE INDEX IF NOT EXISTS automations_type_idx      ON automations (type);
CREATE INDEX IF NOT EXISTS utm_orders_campaign_idx   ON utm_orders (utm_campaign);

-- ── Views ──────────────────────────────────────────────────────────────────

-- Daily aggregated view
CREATE OR REPLACE VIEW campaign_daily_summary AS
SELECT
  date,
  COUNT(*)                                       AS campaign_count,
  SUM(sent)                                      AS total_sent,
  SUM(delivered)                                 AS total_delivered,
  SUM(seen)                                      AS total_seen,
  SUM(clicks)                                    AS total_clicks,
  SUM(buyers)                                    AS total_buyers,
  SUM(sales)                                     AS total_sales,
  SUM(orders)                                    AS total_orders,
  SUM(cost)                                      AS total_cost,
  ROUND(SUM(delivered)::NUMERIC / NULLIF(SUM(sent),0) * 100, 2)   AS delivery_rate,
  ROUND(SUM(seen)::NUMERIC      / NULLIF(SUM(delivered),0) * 100, 2) AS open_rate,
  ROUND(SUM(sales)::NUMERIC     / NULLIF(SUM(cost),0), 4)          AS roas
FROM campaigns
GROUP BY date
ORDER BY date;

-- Segment aggregated view
CREATE OR REPLACE VIEW segment_summary AS
SELECT
  segment,
  COUNT(*)                                       AS campaign_count,
  SUM(sent)                                      AS total_sent,
  SUM(delivered)                                 AS total_delivered,
  SUM(seen)                                      AS total_seen,
  SUM(clicks)                                    AS total_clicks,
  SUM(buyers)                                    AS total_buyers,
  SUM(sales)                                     AS total_sales,
  SUM(orders)                                    AS total_orders,
  SUM(cost)                                      AS total_cost,
  ROUND(SUM(delivered)::NUMERIC / NULLIF(SUM(sent),0) * 100, 2)   AS delivery_rate,
  ROUND(SUM(seen)::NUMERIC      / NULLIF(SUM(delivered),0) * 100, 2) AS open_rate,
  ROUND(SUM(clicks)::NUMERIC    / NULLIF(SUM(delivered),0) * 100, 4) AS avg_ctr,
  ROUND(SUM(sales)::NUMERIC     / NULLIF(SUM(cost),0), 4)           AS roas,
  ROUND(SUM(sales)::NUMERIC     / NULLIF(SUM(delivered),0), 4)      AS revenue_per_delivered
FROM campaigns
GROUP BY segment
ORDER BY total_sales DESC;

-- Offer aggregated view
CREATE OR REPLACE VIEW offer_summary AS
SELECT
  offer,
  COUNT(*)                                       AS campaign_count,
  SUM(sent)                                      AS total_sent,
  SUM(delivered)                                 AS total_delivered,
  SUM(clicks)                                    AS total_clicks,
  SUM(buyers)                                    AS total_buyers,
  SUM(sales)                                     AS total_sales,
  SUM(orders)                                    AS total_orders,
  SUM(cost)                                      AS total_cost,
  ROUND(SUM(clicks)::NUMERIC  / NULLIF(SUM(delivered),0) * 100, 4) AS avg_ctr,
  ROUND(SUM(sales)::NUMERIC   / NULLIF(SUM(cost),0), 4)            AS roas,
  ROUND(SUM(sales)::NUMERIC   / NULLIF(SUM(delivered),0), 4)       AS revenue_per_delivered,
  ROUND(SUM(buyers)::NUMERIC  / NULLIF(SUM(clicks),0) * 100, 4)    AS buyer_conversion
FROM campaigns
GROUP BY offer
ORDER BY total_sales DESC;

-- ── RLS (Row Level Security) ───────────────────────────────────────────────
-- Enable RLS — anon key can only READ; writes require service role
ALTER TABLE campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_exports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_orders   ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated to read everything
CREATE POLICY "allow_read_campaigns"   ON campaigns   FOR SELECT USING (true);
CREATE POLICY "allow_read_automations" ON automations FOR SELECT USING (true);
CREATE POLICY "allow_read_raw_exports" ON raw_exports FOR SELECT USING (true);
CREATE POLICY "allow_read_utm_orders"  ON utm_orders  FOR SELECT USING (true);

-- Writes only via service role (API routes) — no direct client writes
-- The service role bypasses RLS automatically

-- ── Done ──────────────────────────────────────────────────────────────────
-- After running this, go to Storage → Create a bucket called "exports"
-- Make it private (service role only for uploads)
