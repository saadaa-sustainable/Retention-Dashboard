import type { DefItem } from '@/components/ui'

// Definitions are page-specific. Each entry must correspond to a label,
// column, or computed value that actually appears on that page — no orphans.

export const DEFS: Record<string, DefItem[]> = {
  // ── Overview tab ─────────────────────────────────────────────────────────
  // Shows: KPI cards (Total Orders/Sales/Buyers/Messages Sent/Msg Delivered/New Customers),
  //        Messaging funnel (Sent → Delivered → Seen → Clicks → Buyers),
  //        Metric cards (Avg DR / Avg OR / Avg CTR / Total Cost / Avg ROAS /
  //        Total Unsubs / Rev/Delivered / Buyers/Sent).
  overview: [
    { term: 'Total Orders',        formula: 'Σ Orders',                       desc: 'Sum of orders across all campaigns in the current filter.' },
    { term: 'Total Sales',         formula: 'Σ Sales (₹)',                    desc: 'Total revenue attributed to campaigns in the current filter.' },
    { term: 'Total Buyers',        formula: 'Σ Buyers',                       desc: 'Total distinct buyers attributed to campaigns.' },
    { term: 'Messages Sent',       formula: 'Σ Sent',                         desc: 'Total messages sent across all campaigns.' },
    { term: 'Msg Delivered',       formula: 'Σ Delivered',                    desc: 'Total messages that successfully reached recipients.' },
    { term: 'New Customers',       formula: 'Total Buyers × 0.42 (estimate)', desc: 'Estimated first-time buyers — assumes ~42% of buyers are new (rough heuristic).' },
    { term: 'Avg Delivery Rate',   formula: 'Σ Delivered ÷ Σ Sent × 100',     desc: '% of sent messages successfully delivered.' },
    { term: 'Avg Open Rate',       formula: 'Σ Seen ÷ Σ Delivered × 100',     desc: '% of delivered messages that were opened/seen.' },
    { term: 'Avg CTR',             formula: 'mean(per-row CTR)',              desc: 'Average click-through rate across campaigns that have a non-zero CTR.' },
    { term: 'Total Cost',          formula: 'Σ Cost (₹)',                     desc: 'Total spend across the campaigns in view.' },
    { term: 'Avg ROAS',            formula: 'mean(per-row ROAS)',             desc: 'Average return on ad spend across campaigns with a non-zero ROAS.' },
    { term: 'Total Unsubs',        formula: 'Σ Unsubscribers',                desc: 'Total recipients who unsubscribed after a campaign.' },
    { term: 'Rev/Delivered',       formula: 'Σ Sales ÷ Σ Delivered (₹)',      desc: 'Average revenue earned per delivered message.' },
    { term: 'Buyers/Sent',         formula: 'Σ Buyers ÷ Σ Sent × 100',        desc: '% of all sent messages that converted to a buyer.' },
  ],

  // ── Campaigns tab (cards + drilldown views) ──────────────────────────────
  // Shows: cards aggregated by campaign_id with (Sent / Delivered % / Sales / ROAS),
  //        category cards with same metrics,
  //        detail table with (Segment / Date / Sent / Delivered / Del % / Open % /
  //        CTR / Buyers / Sales / Orders / Cost / ROAS).
  campaigns: [
    { term: 'Sent',                formula: 'Σ Sent',                         desc: 'Total messages dispatched for this campaign / category / row.' },
    { term: 'Delivered',           formula: 'Σ Delivered',                    desc: 'Messages confirmed delivered to recipients.' },
    { term: 'Delivery Rate (Del %)', formula: 'Delivered ÷ Sent × 100',       desc: '% of sent messages that successfully reached recipients.' },
    { term: 'Open Rate (Open %)',  formula: 'Seen ÷ Delivered × 100',         desc: '% of delivered messages that were opened or seen.' },
    { term: 'CTR',                 formula: 'Per-row click-through %',        desc: 'Click-through rate as reported by the source (Clicks ÷ Delivered × 100).' },
    { term: 'Buyers',              formula: 'Σ Buyers',                       desc: 'Recipients who completed a purchase attributed to this campaign.' },
    { term: 'Sales',               formula: 'Σ Sales (₹)',                    desc: 'Total revenue attributed to this campaign.' },
    { term: 'Orders',              formula: 'Σ Orders',                       desc: 'Number of orders placed from this campaign.' },
    { term: 'Cost',                formula: 'Σ Cost (₹)',                     desc: 'Total ad/messaging cost for this campaign.' },
    { term: 'ROAS',                formula: 'Sales ÷ Cost',                   desc: 'Return on ad spend — revenue earned per ₹1 spent.' },
    { term: 'Segments / Sends',    formula: 'unique segments · row count',    desc: 'Subtitle on each card — how many distinct included-segments this campaign ran on, and the total send count.' },
    { term: 'Campaigns (group)',   formula: 'distinct campaign IDs',          desc: 'On grouped cards (HR / HT / Others), the number of underlying campaign IDs clubbed into this card.' },
  ],

  // ── Automations tab ──────────────────────────────────────────────────────
  // Shows: top metric cards (Auto Sales/Orders/Buyers/Cost · Carts Recovered/Won),
  //        table (Automation / Type / As of / Sent / Delivered / Seen / CTR /
  //        Buyers / Sales · Recovered / Cost / ROAS).
  automations: [
    { term: 'Auto Sales',          formula: 'Σ Sales for standard automations (₹)', desc: 'Revenue from standard (non-cart-recovery) automations.' },
    { term: 'Auto Orders',         formula: 'Σ Orders for standard automations',    desc: 'Order count from standard automations.' },
    { term: 'Auto Buyers',         formula: 'Σ Buyers for standard automations',    desc: 'Buyer count from standard automations.' },
    { term: 'Auto Cost',           formula: 'Σ Cost for standard automations (₹)',  desc: 'Spend on standard automations.' },
    { term: 'Carts Recovered',     formula: 'Σ Recovered Amount (₹)',         desc: '(Cart Recovery only) Total ₹ value of abandoned carts recovered.' },
    { term: 'Carts Won',           formula: 'Σ Recovered Carts',              desc: '(Cart Recovery only) Number of carts successfully recovered.' },
    { term: 'As of',               formula: 'Snapshot date (set at upload)',  desc: 'The date this row’s data was captured. Automation CSVs are cumulative — re-uploading with a new date overwrites the snapshot.' },
    { term: 'Sent / Delivered / Seen', formula: 'Σ from the latest snapshot', desc: 'Raw funnel counters for the automation as of its snapshot date.' },
    { term: 'CTR',                 formula: 'Per-row click-through %',        desc: 'Click-through rate as reported by the source.' },
    { term: 'Sales / Recovered',   formula: 'Σ Sales OR Σ Recovered Amount',  desc: 'For standard rows shows Sales; for Cart Recovery rows shows recovered cart value (and recovered cart count below).' },
    { term: 'ROAS',                formula: 'Sales (or Recovered) ÷ Cost',    desc: 'Revenue (or recovery) generated per ₹1 spent.' },
  ],

  // ── Segment Analytics tab ────────────────────────────────────────────────
  // Shows: charts (Top by sales · Top by ROAS),
  //        table (Segment / Campaigns / Sent / Delivered / Del % / Open % /
  //        Buyers / Sales / ROAS / Rev/Del).
  segment: [
    { term: 'Campaigns',           formula: 'count(campaigns in segment)',    desc: 'How many distinct campaign rows targeted this segment.' },
    { term: 'Sent / Delivered',    formula: 'Σ Sent · Σ Delivered',           desc: 'Total messages sent and delivered to this segment across all campaigns.' },
    { term: 'Del %',               formula: 'Σ Delivered ÷ Σ Sent × 100',     desc: 'Aggregate delivery rate across all campaigns for this segment.' },
    { term: 'Open %',              formula: 'Σ Seen ÷ Σ Delivered × 100',     desc: 'Aggregate open rate across all campaigns in this segment.' },
    { term: 'Buyers',              formula: 'Σ Buyers',                       desc: 'Total buyers attributed to this segment.' },
    { term: 'Sales',               formula: 'Σ Sales (₹)',                    desc: 'Total revenue attributed to this segment.' },
    { term: 'ROAS',                formula: 'Σ Sales ÷ Σ Cost',               desc: 'Aggregate return on ad spend for the segment.' },
    { term: 'Rev/Del',             formula: 'Σ Sales ÷ Σ Delivered (₹)',      desc: 'Revenue per delivered message — efficiency of reaching this segment.' },
  ],

  // ── Offer Analytics tab ──────────────────────────────────────────────────
  // Shows: pie (Revenue by offer type) · Offer quick comparison,
  //        table (Offer / Campaigns / Sent / Delivered / Avg CTR / Buyers /
  //        Sales / ROAS / Rev/Del / Buyer Conv).
  offer: [
    { term: 'Campaigns',           formula: 'count(campaigns with this offer)', desc: 'Number of campaigns that used this offer type.' },
    { term: 'Sent / Delivered',    formula: 'Σ Sent · Σ Delivered',           desc: 'Aggregate volume across campaigns using this offer.' },
    { term: 'Avg CTR',             formula: 'Σ Clicks ÷ Σ Delivered × 100',   desc: 'Aggregate click rate for campaigns using this offer.' },
    { term: 'Buyers',              formula: 'Σ Buyers',                       desc: 'Total buyers from campaigns running this offer.' },
    { term: 'Sales',               formula: 'Σ Sales (₹)',                    desc: 'Total revenue attributed to this offer type.' },
    { term: 'ROAS',                formula: 'Σ Sales ÷ Σ Cost',               desc: 'Aggregate ROAS for campaigns using this offer.' },
    { term: 'Rev/Del',             formula: 'Σ Sales ÷ Σ Delivered (₹)',      desc: 'Revenue per delivered message for this offer.' },
    { term: 'Buyer Conv',          formula: 'Σ Buyers ÷ Σ Clicks × 100',      desc: '% of clicks that converted to a buyer for this offer.' },
  ],

  // ── Funnel Analysis tab ──────────────────────────────────────────────────
  // Shows: full funnel bars (Sent / Delivered / Seen / Clicked / Buyers / Orders),
  //        best & lowest delivery-rate lists,
  //        rate summary cards (Delivery / Open / Click Rate (sent) /
  //        Click to Open / Buyer Rate / Click to Purchase).
  funnel: [
    { term: 'Sent / Delivered / Seen / Clicked / Buyers / Orders', formula: 'Raw funnel counters (Σ)', desc: 'The six aggregate counters that drive the funnel bars.' },
    { term: 'Delivery Rate',       formula: 'Delivered ÷ Sent × 100',         desc: '% of sent messages that reached recipients.' },
    { term: 'Open Rate',           formula: 'Seen ÷ Delivered × 100',         desc: '% of delivered messages that were opened.' },
    { term: 'Click Rate (sent)',   formula: 'Clicks ÷ Sent × 100',            desc: '% of all sent messages that generated a click (denominator is Sent, not Delivered).' },
    { term: 'Click to Open',       formula: 'Clicks ÷ Seen × 100',            desc: 'Of messages opened, the % that also generated a click.' },
    { term: 'Buyer Rate',          formula: 'Buyers ÷ Sent × 100',            desc: '% of all sent messages that ultimately led to a buyer.' },
    { term: 'Click to Purchase',   formula: 'Buyers ÷ Clicks × 100',          desc: '% of clicks that converted to a purchase.' },
  ],

  // ── Revenue & Conversion tab ─────────────────────────────────────────────
  // Shows: KPI cards (Total Revenue / Total Cost / Overall ROAS / Rev/Delivered /
  //        Rev/Sent / Cost per Buyer / Cost per Order / Order Conversion),
  //        Top 10 by Rev/Del · ROAS distribution histogram.
  revenue: [
    { term: 'Total Revenue',       formula: 'Σ Sales (₹)',                    desc: 'Sum of all campaign-attributed revenue in the current filter.' },
    { term: 'Total Cost',          formula: 'Σ Cost (₹)',                     desc: 'Sum of all campaign spend in the current filter.' },
    { term: 'Overall ROAS',        formula: 'Σ Sales ÷ Σ Cost',               desc: 'Aggregate return on ad spend across all campaigns.' },
    { term: 'Rev/Delivered',       formula: 'Σ Sales ÷ Σ Delivered (₹)',      desc: 'Revenue earned per delivered message.' },
    { term: 'Rev/Sent',            formula: 'Σ Sales ÷ Σ Sent (₹)',           desc: 'Revenue earned per sent message (includes undelivered).' },
    { term: 'Cost per Buyer',      formula: 'Σ Cost ÷ Σ Buyers (₹)',          desc: 'Average acquisition cost per buyer.' },
    { term: 'Cost per Order',      formula: 'Σ Cost ÷ Σ Orders (₹)',          desc: 'Average cost per order placed.' },
    { term: 'Order Conversion',    formula: 'Σ Orders ÷ Σ Clicks × 100',      desc: '% of clicks that resulted in an order.' },
    { term: 'ROAS distribution',   formula: 'count of campaigns per bucket',  desc: 'Histogram bucketing campaigns by ROAS into 0–3x / 3–10x / 10–30x / 30–60x / 60x+ bands.' },
  ],

  // ── Historical Trends tab ────────────────────────────────────────────────
  // Shows: charts (Daily sales · Daily Sent vs Delivered),
  //        table (Date / Campaigns / Sent / Delivered / Del % / Buyers / Sales w/ Δ% / ROAS).
  historical: [
    { term: 'Date',                formula: 'YYYY-MM-DD',                     desc: 'One row per send-date with all campaigns on that date aggregated.' },
    { term: 'Campaigns',           formula: 'count(campaigns on this date)',  desc: 'Number of distinct campaign rows that went out on this date.' },
    { term: 'Sent / Delivered',    formula: 'Σ Sent · Σ Delivered',           desc: 'Daily volume of messages sent and delivered.' },
    { term: 'Del %',               formula: 'Σ Delivered ÷ Σ Sent × 100',     desc: 'Daily delivery rate.' },
    { term: 'Sales',               formula: 'Σ Sales (₹)',                    desc: 'Daily revenue attributed to campaigns sent on this date.' },
    { term: 'Day-over-Day Δ%',     formula: '(Today − Yesterday) ÷ Yesterday × 100', desc: 'Small percentage next to Sales — change vs. the previous date in the sorted list.' },
    { term: 'ROAS',                formula: 'Σ Sales ÷ Σ Cost',               desc: 'Daily aggregate ROAS.' },
  ],
}
