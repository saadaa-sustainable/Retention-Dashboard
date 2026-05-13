import type { Campaign, Automation, FunnelMetrics, KpiSummary, SegmentSummary, OfferSummary, DailySummary } from '@/types'

// ── Safe division ──────────────────────────────────────────────────────────
export const safeDivide = (a: number, b: number): number => (b === 0 ? 0 : a / b)

// ── Formatters ─────────────────────────────────────────────────────────────
export const fmtNumber = (n: number): string =>
  new Intl.NumberFormat('en-IN').format(Math.round(n || 0))

export const fmtCurrency = (n: number): string => '₹' + fmtNumber(n)

export const fmtPct = (n: number | null | undefined, decimals = 2): string =>
  n == null || isNaN(n) || n === 0 ? '—' : n.toFixed(decimals) + '%'

export const fmtRoas = (n: number | null | undefined): string =>
  n == null || isNaN(n) || n === 0 ? '—' : n.toFixed(2) + 'x'

export const fmtDecimal = (n: number, d = 2): string =>
  n == null || isNaN(n) ? '—' : n.toFixed(d)

// ── Per-row derived metrics ────────────────────────────────────────────────
export const deliveryRate      = (r: Campaign | Automation): number => safeDivide(r.delivered, r.sent) * 100
export const openRate          = (r: Campaign | Automation): number => safeDivide(r.seen, r.delivered) * 100
export const ctr               = (r: Campaign | Automation): number => safeDivide(r.clicks, r.delivered) * 100
export const clickToOpen       = (r: Campaign | Automation): number => safeDivide(r.clicks, r.seen) * 100
export const buyerConversion   = (r: Campaign | Automation): number => safeDivide(r.buyers, r.clicks) * 100
export const orderConversion   = (r: Campaign): number => safeDivide(r.orders, r.clicks) * 100
export const revenuePerDel     = (r: Campaign | Automation): number => safeDivide((r as Campaign).sales, r.delivered)
export const revenuePerSent    = (r: Campaign | Automation): number => safeDivide((r as Campaign).sales, r.sent)
export const unsubscribeRate   = (r: Campaign | Automation): number => safeDivide(r.unsubscribers, r.delivered) * 100
export const buyerToSegment    = (r: Campaign): number => safeDivide(r.buyers, r.sent) * 100
export const orderToSegment    = (r: Campaign): number => safeDivide(r.orders, r.sent) * 100
export const costPerBuyer      = (r: Campaign | Automation): number => safeDivide(r.cost, r.buyers)
export const costPerOrder      = (r: Campaign): number => safeDivide(r.cost, r.orders)
export const recoveryRate      = (r: Automation): number => safeDivide(r.recovered_carts, r.sent) * 100
export const costPerRecovery   = (r: Automation): number => safeDivide(r.cost, r.recovered_carts)

// ── Aggregate sum helper ───────────────────────────────────────────────────
export function sumKey<T>(arr: T[], key: keyof T): number {
  return arr.reduce((acc, r) => acc + ((r[key] as number) || 0), 0)
}

// ── KPI summary from campaign array ───────────────────────────────────────
export function computeKpis(campaigns: Campaign[]): KpiSummary {
  return {
    total_orders:    sumKey(campaigns, 'orders'),
    total_sales:     sumKey(campaigns, 'sales'),
    total_buyers:    sumKey(campaigns, 'buyers'),
    total_sent:      sumKey(campaigns, 'sent'),
    total_delivered: sumKey(campaigns, 'delivered'),
    new_customers:   Math.round(sumKey(campaigns, 'buyers') * 0.42),
  }
}

// ── Funnel metrics from campaign array ────────────────────────────────────
export function computeFunnel(campaigns: Campaign[]): FunnelMetrics {
  const sent      = sumKey(campaigns, 'sent')
  const delivered = sumKey(campaigns, 'delivered')
  const seen      = sumKey(campaigns, 'seen')
  const clicks    = sumKey(campaigns, 'clicks')
  const buyers    = sumKey(campaigns, 'buyers')
  const orders    = sumKey(campaigns, 'orders')

  return {
    sent, delivered, seen, clicks, buyers, orders,
    delivery_rate:     safeDivide(delivered, sent) * 100,
    open_rate:         safeDivide(seen, delivered) * 100,
    click_rate:        safeDivide(clicks, sent) * 100,
    click_to_open:     safeDivide(clicks, seen) * 100,
    buyer_rate:        safeDivide(buyers, sent) * 100,
    click_to_purchase: safeDivide(buyers, clicks) * 100,
  }
}

// ── Segment aggregation ────────────────────────────────────────────────────
export function computeSegments(campaigns: Campaign[]): SegmentSummary[] {
  const map = new Map<string, SegmentSummary>()
  campaigns.forEach(r => {
    if (!map.has(r.segment)) {
      map.set(r.segment, {
        segment: r.segment, campaign_count: 0,
        sent: 0, delivered: 0, seen: 0, clicks: 0,
        buyers: 0, unsubscribers: 0, sales: 0, orders: 0, cost: 0,
        delivery_rate: 0, open_rate: 0, ctr: 0, roas: 0, revenue_per_delivered: 0,
      })
    }
    const m = map.get(r.segment)!
    m.campaign_count++
    ;(['sent','delivered','seen','clicks','buyers','unsubscribers','sales','orders','cost'] as const)
      .forEach(k => { (m as unknown as Record<string, number>)[k] += (r as unknown as Record<string, number>)[k] || 0 })
  })
  return [...map.values()].map(m => ({
    ...m,
    delivery_rate:        safeDivide(m.delivered, m.sent) * 100,
    open_rate:            safeDivide(m.seen, m.delivered) * 100,
    ctr:                  safeDivide(m.clicks, m.delivered) * 100,
    roas:                 safeDivide(m.sales, m.cost),
    revenue_per_delivered: safeDivide(m.sales, m.delivered),
  })).sort((a, b) => b.sales - a.sales)
}

// ── Offer aggregation ──────────────────────────────────────────────────────
export function computeOffers(campaigns: Campaign[]): OfferSummary[] {
  const map = new Map<string, OfferSummary>()
  campaigns.forEach(r => {
    const offer = r.offer || 'Unknown'
    if (!map.has(offer)) {
      map.set(offer, {
        offer, campaign_count: 0,
        sent: 0, delivered: 0, clicks: 0, buyers: 0,
        sales: 0, orders: 0, cost: 0,
        ctr: 0, roas: 0, revenue_per_delivered: 0, buyer_conversion: 0,
      })
    }
    const m = map.get(offer)!
    m.campaign_count++
    ;(['sent','delivered','clicks','buyers','sales','orders','cost'] as const)
      .forEach(k => { (m as unknown as Record<string, number>)[k] += (r as unknown as Record<string, number>)[k] || 0 })
  })
  return [...map.values()].map(m => ({
    ...m,
    ctr:                  safeDivide(m.clicks, m.delivered) * 100,
    roas:                 safeDivide(m.sales, m.cost),
    revenue_per_delivered: safeDivide(m.sales, m.delivered),
    buyer_conversion:     safeDivide(m.buyers, m.clicks) * 100,
  })).sort((a, b) => b.sales - a.sales)
}

// ── Daily aggregation ──────────────────────────────────────────────────────
export function computeDaily(campaigns: Campaign[]): DailySummary[] {
  const map = new Map<string, DailySummary>()
  campaigns.forEach(r => {
    if (!map.has(r.date)) {
      map.set(r.date, {
        date: r.date, campaign_count: 0,
        sent: 0, delivered: 0, seen: 0, clicks: 0,
        buyers: 0, sales: 0, orders: 0, cost: 0,
        delivery_rate: 0, roas: 0,
      })
    }
    const m = map.get(r.date)!
    m.campaign_count++
    ;(['sent','delivered','seen','clicks','buyers','sales','orders','cost'] as const)
      .forEach(k => { (m as unknown as Record<string, number>)[k] += (r as unknown as Record<string, number>)[k] || 0 })
  })
  return [...map.values()].map(m => ({
    ...m,
    delivery_rate: safeDivide(m.delivered, m.sent) * 100,
    roas:          safeDivide(m.sales, m.cost),
  })).sort((a, b) => a.date.localeCompare(b.date))
}
