'use client'
import { useMemo } from 'react'
import { useDashStore } from '@/lib/store'
import { X, ChevronDown } from 'lucide-react'

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  overview:    { title: 'Overview',             sub: 'All campaigns · Included segments only' },
  campaigns:   { title: 'Campaigns',            sub: 'Detailed campaign performance table' },
  automations: { title: 'Automations',          sub: 'Standard automations + GoKwik cart recovery' },
  segment:     { title: 'Segment Analytics',    sub: 'Performance grouped by included segment' },
  offer:       { title: 'Offer Analytics',      sub: 'Revenue and conversion by offer type' },
  funnel:      { title: 'Funnel Analysis',      sub: 'Sent → Delivered → Seen → Clicks → Buyers' },
  revenue:     { title: 'Revenue & Conversion', sub: 'ROI, cost efficiency and revenue intelligence' },
  historical:  { title: 'Historical Trends',    sub: 'Day-over-day performance trends' },
}

interface TopBarProps {
  tab: string
  campaignIds: string[]
  segments: string[]
  offers: string[]
  dates: string[]
}

export default function TopBar({ tab, campaignIds, segments, offers, dates }: TopBarProps) {
  const { filters, setFilter, clearFilters } = useDashStore()
  const meta    = PAGE_TITLES[tab] || PAGE_TITLES.overview
  const hasFilter = Object.values(filters).some(v => v !== 'ALL' && v !== '')
  const sortedDates = useMemo(() => [...dates].sort().reverse(), [dates])

  const sel = (label: string, key: keyof typeof filters, options: string[], display?: (v:string)=>string) => {
    const active = filters[key] !== 'ALL' && filters[key] !== ''
    return (
      <div className="relative">
        <select
          value={filters[key]}
          onChange={e => setFilter(key, e.target.value)}
          className={`h-8 text-[12px] pl-2.5 pr-7 rounded-lg border bg-white text-gray-700 appearance-none cursor-pointer transition-colors hover:border-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
            ${active ? 'border-blue-300 bg-blue-50/60 text-blue-700 font-medium' : 'border-black/[0.1]'}`}
        >
          <option value="ALL">{label}</option>
          {options.map(o => <option key={o} value={o}>{display ? display(o) : o}</option>)}
        </select>
        <ChevronDown size={12} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${active ? 'text-blue-500' : 'text-gray-400'}`} />
      </div>
    )
  }

  return (
    <div className="bg-white/80 backdrop-blur-md border-b border-black/[0.06] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap flex-shrink-0 sticky top-0 z-20">
      <div>
        <h2 className="text-[16px] font-semibold text-gray-900 leading-tight tracking-tight">{meta.title}</h2>
        <p className="text-[11.5px] text-gray-500 mt-0.5">{meta.sub}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sel('All Dates',       'date',        sortedDates, d => d.slice(5))}
        {sel('All Channels',    'channel',     ['whatsapp','sms','email'])}
        {sel('All Campaign IDs','campaign_id', campaignIds)}
        {sel('All Segments',    'segment',     segments, s => s.length > 30 ? s.slice(0,30)+'…' : s)}
        {sel('All Offers',      'offer',       offers)}
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-8 px-2.5 text-[12px] rounded-lg bg-red-50 text-red-600 border border-red-200/80 hover:bg-red-100 transition-colors font-medium"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>
    </div>
  )
}
