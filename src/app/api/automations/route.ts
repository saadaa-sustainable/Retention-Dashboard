import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const supabase = createAdminClient()

    const limit = Math.min(parseInt(searchParams.get('limit') || '10000'), 50000)

    let query = supabase
      .from('automations')
      .select('*')
      .order('sales', { ascending: false })
      .range(0, limit - 1)

    const type     = searchParams.get('type')
    const channel  = searchParams.get('channel')
    const date     = searchParams.get('date')
    const dateFrom = searchParams.get('date_from')
    const dateTo   = searchParams.get('date_to')

    if (type)    query = query.eq('type', type)
    if (channel) query = query.eq('channel', channel)
    if (date)    query = query.eq('date', date)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo)   query = query.lte('date', dateTo)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data, count: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
