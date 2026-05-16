// ── Campaign types ─────────────────────────────────────────────────────────

export type Channel = 'whatsapp' | 'email' | 'sms'

export interface Campaign {
  id: string
  name: string
  campaign_id: string          // parsed: C130, HTC01, MPC01 …
  source_type: string          // parsed: RET, WEB …
  segment: string              // included segment name
  offer: string                // parsed offer code: USP, COD, POLL …
  format: string               // IMG, TXT, VID …
  channel: Channel
  date: string                 // YYYY-MM-DD
  sent: number
  delivered: number
  seen: number
  ctr: number | null
  clicks: number
  buyers: number
  unsubscribers: number
  sales: number
  orders: number
  cost: number
  roas: number | null
  source_raw: string
  ingested_at: string
  // derived (computed on read)
  delivery_rate?: number
  open_rate?: number
  buyer_conversion?: number
  revenue_per_delivered?: number
  unsubscribe_rate?: number
}

// ── Automation types ───────────────────────────────────────────────────────

export type AutomationType = 'standard' | 'cart_recovery'

export interface Automation {
  id: string
  name: string
  type: AutomationType
  channel: Channel
  date: string | null          // snapshot "as-of" date (YYYY-MM-DD) set at upload time
  sent: number
  delivered: number
  seen: number
  ctr: number | null
  clicks: number
  buyers: number
  unsubscribers: number
  sales: number
  orders: number
  cost: number
  roas: number | null
  recovered_amount: number     // cart_recovery only
  recovered_carts: number      // cart_recovery only
  ingested_at: string
}

// ── Derived / aggregated ───────────────────────────────────────────────────

export interface SegmentSummary {
  segment: string
  campaign_count: number
  sent: number
  delivered: number
  seen: number
  clicks: number
  buyers: number
  unsubscribers: number
  sales: number
  orders: number
  cost: number
  delivery_rate: number
  open_rate: number
  ctr: number
  roas: number
  revenue_per_delivered: number
}

export interface OfferSummary {
  offer: string
  campaign_count: number
  sent: number
  delivered: number
  clicks: number
  buyers: number
  sales: number
  orders: number
  cost: number
  ctr: number
  roas: number
  revenue_per_delivered: number
  buyer_conversion: number
}

export interface DailySummary {
  date: string
  campaign_count: number
  sent: number
  delivered: number
  seen: number
  clicks: number
  buyers: number
  sales: number
  orders: number
  cost: number
  delivery_rate: number
  roas: number
}

export interface FunnelMetrics {
  sent: number
  delivered: number
  seen: number
  clicks: number
  buyers: number
  orders: number
  delivery_rate: number
  open_rate: number
  click_rate: number
  click_to_open: number
  buyer_rate: number
  click_to_purchase: number
}

export interface KpiSummary {
  total_orders: number
  total_sales: number
  total_buyers: number
  total_sent: number
  total_delivered: number
  new_customers: number
}

// ── Upload / ingestion ─────────────────────────────────────────────────────

export type ExportType = 'campaigns' | 'automations' | 'gokwik_carts'

export interface UploadResult {
  success: boolean
  inserted: number     // truly new rows
  updated: number      // existed (matched on (name,date) / name) but values differed → overwritten
  skipped: number      // byte-identical to existing row → no DB write
  errors: string[]
  export_type: ExportType
}

// ── Filters ────────────────────────────────────────────────────────────────

export interface GlobalFilters {
  date: string        // 'ALL' or YYYY-MM-DD
  campaign_id: string // 'ALL' or e.g. 'C130'
  segment: string     // 'ALL' or segment name
  offer: string       // 'ALL' or offer code
  channel: string     // 'ALL' | 'whatsapp' | 'sms' | 'email'
  date_from: string   // YYYY-MM-DD or ''
  date_to: string     // YYYY-MM-DD or ''
}

// ── Supabase row shapes ────────────────────────────────────────────────────

export interface CampaignRow {
  id: string
  name: string
  campaign_id: string
  source_type: string
  segment: string
  offer: string
  format: string
  channel: string
  date: string
  sent: number
  delivered: number
  seen: number
  ctr: number | null
  clicks: number
  buyers: number
  unsubscribers: number
  sales: number
  orders: number
  cost: number
  roas: number | null
  source_raw: string
  ingested_at: string
}

export interface AutomationRow {
  id: string
  name: string
  type: string
  channel: string
  date: string | null
  sent: number
  delivered: number
  seen: number
  ctr: number | null
  clicks: number
  buyers: number
  unsubscribers: number
  sales: number
  orders: number
  cost: number
  roas: number | null
  recovered_amount: number
  recovered_carts: number
  ingested_at: string
}
