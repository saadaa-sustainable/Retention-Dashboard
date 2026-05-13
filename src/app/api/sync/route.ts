import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime  = 'nodejs'
export const maxDuration = 60

interface ShopifyOrder {
  id: number | string
  order_number: number | string
  total_price: string | null
  created_at: string
  landing_site: string | null
}

// Fetch last N days of Shopify orders and extract UTM attribution
async function fetchShopifyOrders(daysBack = 7): Promise<ShopifyOrder[]> {
  const domain  = process.env.SHOPIFY_STORE_DOMAIN
  const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  const version = process.env.SHOPIFY_API_VERSION || '2025-01'
  if (!domain || !token) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must be set')
  }

  const since = new Date()
  since.setDate(since.getDate() - daysBack)

  const url = `https://${domain}/admin/api/${version}/orders.json?` +
    `created_at_min=${since.toISOString()}&` +
    `status=any&fields=id,order_number,total_price,created_at,note_attributes,landing_site,referring_site&` +
    `limit=250`

  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`)
  const json = await res.json() as { orders: ShopifyOrder[] }
  return json.orders
}

// Extract UTM params from Shopify order landing_site URL
function extractUtm(landingSite: string | null) {
  if (!landingSite) return {}
  try {
    const url    = new URL(landingSite.startsWith('http') ? landingSite : 'https://x.com' + landingSite)
    return {
      utm_source:   url.searchParams.get('utm_source'),
      utm_medium:   url.searchParams.get('utm_medium'),
      utm_campaign: url.searchParams.get('utm_campaign'),
      utm_content:  url.searchParams.get('utm_content'),
      utm_term:     url.searchParams.get('utm_term'),
    }
  } catch {
    return {}
  }
}

async function runSync(daysBack: number) {
  const orders   = await fetchShopifyOrders(daysBack)
  const supabase = createAdminClient()

  let synced  = 0
  let skipped = 0

  for (const order of orders) {
    const utm = extractUtm(order.landing_site)
    if (!utm.utm_campaign) { skipped++; continue }

    const { error } = await supabase.from('utm_orders').upsert({
      shopify_order_id: String(order.id),
      order_number:     String(order.order_number),
      total_price:      parseFloat(order.total_price || '0'),
      created_at:       order.created_at,
      utm_source:       utm.utm_source,
      utm_medium:       utm.utm_medium,
      utm_campaign:     utm.utm_campaign,
      utm_content:      utm.utm_content,
      utm_term:         utm.utm_term,
      campaign_name:    utm.utm_campaign,
    }, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

    if (error) console.error('UTM upsert error:', error)
    else synced++
  }

  return { success: true, orders_fetched: orders.length, synced, skipped }
}

// GET — for cron jobs. Requires CRON_SECRET via header or ?secret= query param.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const daysBack = parseInt(req.nextUrl.searchParams.get('days') || '7')
    return NextResponse.json(await runSync(daysBack))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    console.error('Sync error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST — for manual UI-triggered sync from the dashboard.
// Same-origin only (browser enforces this for non-CORS requests).
export async function POST(req: NextRequest) {
  try {
    const daysBack = parseInt(req.nextUrl.searchParams.get('days') || '7')
    return NextResponse.json(await runSync(daysBack))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    console.error('Sync error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
