import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const supabase = createAdminClient()

    let query = supabase
      .from('automations')
      .select('*')
      .order('sales', { ascending: false })

    const type    = searchParams.get('type')
    const channel = searchParams.get('channel')

    if (type)    query = query.eq('type', type)
    if (channel) query = query.eq('channel', channel)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data, count: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
