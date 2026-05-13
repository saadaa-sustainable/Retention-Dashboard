import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const supabase = createAdminClient()

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('date', { ascending: false })

    const date     = searchParams.get('date')
    const cid      = searchParams.get('campaign_id')
    const segment  = searchParams.get('segment')
    const offer    = searchParams.get('offer')
    const channel  = searchParams.get('channel')
    const dateFrom = searchParams.get('date_from')
    const dateTo   = searchParams.get('date_to')
    const limit    = parseInt(searchParams.get('limit') || '500')

    if (date)     query = query.eq('date', date)
    if (cid)      query = query.eq('campaign_id', cid)
    if (segment)  query = query.eq('segment', segment)
    if (offer)    query = query.eq('offer', offer)
    if (channel)  query = query.eq('channel', channel)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo)   query = query.lte('date', dateTo)

    query = query.limit(limit)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data, count: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
