'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashStore } from '@/lib/store'
import { X, ChevronDown, Search } from 'lucide-react'

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  overview:    { title: 'Overview',             sub: 'All campaigns · Included segments only' },
  campaigns:   { title: 'Campaigns',            sub: 'Detailed campaign performance table' },
  automations: { title: 'Automations',          sub: 'Automation performance' },
  segment:     { title: 'Segment Analytics',    sub: 'Performance grouped by included segment' },
  offer:       { title: 'Offer Analytics',      sub: 'Revenue and conversion by offer type' },
  funnel:      { title: 'Funnel Analysis',      sub: 'Sent → Delivered → Seen → Clicks → Buyers' },
  revenue:     { title: 'Revenue & Conversion', sub: 'ROI, cost efficiency and revenue intelligence' },
  historical:  { title: 'Historical Trends',    sub: 'Day-over-day performance trends' },
  templates:   { title: 'Templates',             sub: 'Catalog of campaign & automation templates · classify by type, status and cost' },
}

interface TopBarProps {
  tab: string
  campaignIds: string[]
  segments: string[]
  offers: string[]
  dates: string[]
}

// Tabs whose data source follows the global Campaigns/Automations scope toggle.
const SCOPE_AWARE_TABS = new Set(['overview', 'offer', 'funnel', 'revenue'])

// Combobox-style filter: looks like the old <select> chip, but the trigger is
// an <input> so users can type to filter the option list. Keyboard nav: Arrow
// up/down to highlight, Enter to pick, Esc to close.
function SearchableSelect({
  label,
  value,
  options,
  onChange,
  display,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  display?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const active = value !== 'ALL' && value !== ''
  const displayValue = active ? (display ? display(value) : value) : ''

  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter(o => o.toLowerCase().includes(q) || (display ? display(o).toLowerCase().includes(q) : false))
  }, [options, query, display])

  // The full list including the synthetic "ALL" sentinel as item 0.
  const items: string[] = ['ALL', ...filtered]

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Reset highlight when the filter list changes shape.
  useEffect(() => { setHighlight(0) }, [query, open])

  // Scroll highlighted item into view.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const select = (val: string) => {
    onChange(val)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(items.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = items[highlight]
      if (picked !== undefined) select(picked)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className={`flex items-center h-8 rounded-lg border bg-white transition-colors hover:border-gray-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100
        ${active ? 'border-blue-300 bg-blue-50/60' : 'border-black/[0.1]'}`}>
        <Search size={11} className={`ml-2 ${active ? 'text-blue-500' : 'text-gray-400'}`} />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayValue}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder={label}
          aria-label={label}
          className={`flex-1 bg-transparent border-none outline-none px-1.5 text-[12px] min-w-0 w-32
            ${active ? 'text-blue-700 font-medium placeholder:text-blue-700/60' : 'text-gray-700 placeholder:text-gray-500'}`}
        />
        {active ? (
          <button
            type="button"
            onClick={() => select('ALL')}
            className="mr-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded p-0.5"
            aria-label={`Clear ${label}`}
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown size={12} className={`mr-2 ${open ? 'text-gray-600' : 'text-gray-400'}`} />
        )}
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 min-w-[200px] max-w-[320px] bg-white border border-black/[0.08] rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto py-1"
        >
          <button
            type="button"
            data-idx={0}
            onMouseEnter={() => setHighlight(0)}
            onClick={() => select('ALL')}
            className={`w-full text-left px-2.5 py-1.5 text-[12px] transition-colors
              ${highlight === 0 ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}
              ${value === 'ALL' ? 'font-semibold' : ''}`}
          >
            {label}
          </button>
          {filtered.map((o, i) => {
            const idx = i + 1
            const isHL = highlight === idx
            const isSelected = value === o
            return (
              <button
                key={o}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => select(o)}
                className={`w-full text-left px-2.5 py-1.5 text-[12px] truncate transition-colors
                  ${isHL ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}
                  ${isSelected ? 'font-semibold' : ''}`}
                title={o}
              >
                {display ? display(o) : o}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-2.5 py-3 text-[11px] text-gray-400 text-center">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TopBar({ tab, campaignIds, segments, offers, dates }: TopBarProps) {
  const { filters, setFilter, clearFilters, scope } = useDashStore()
  const meta    = PAGE_TITLES[tab] || PAGE_TITLES.overview
  const hasFilter = Object.values(filters).some(v => v !== 'ALL' && v !== '')
  const sortedDates = useMemo(() => [...dates].sort().reverse(), [dates])

  const rangeActive = filters.date_from !== '' || filters.date_to !== ''
  // Campaign-only filters hide when we're effectively viewing automations:
  // either on the Automations tab, or a scope-aware tab with scope=automations.
  const viewingAutomations = tab === 'automations' || (SCOPE_AWARE_TABS.has(tab) && scope === 'automations')
  const isAutomations = viewingAutomations

  // Small fixed-option <select> for Channel — too few values to need search.
  const channelSelect = (() => {
    const key = 'channel' as const
    const active = filters[key] !== 'ALL' && filters[key] !== ''
    return (
      <div className="relative">
        <select
          value={filters[key]}
          onChange={e => setFilter(key, e.target.value)}
          className={`h-8 text-[12px] pl-2.5 pr-7 rounded-lg border bg-white text-gray-700 appearance-none cursor-pointer transition-colors hover:border-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
            ${active ? 'border-blue-300 bg-blue-50/60 text-blue-700 font-medium' : 'border-black/[0.1]'}`}
        >
          <option value="ALL">All Channels</option>
          {['whatsapp','sms','email','rcs'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={12} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${active ? 'text-blue-500' : 'text-gray-400'}`} />
      </div>
    )
  })()

  const dateRangeInputs = (
    <div className="grid grid-cols-[minmax(132px,160px)_minmax(132px,160px)] gap-2">
      <div>
        <label className="sr-only" htmlFor="date_from">Date from</label>
        <input
          id="date_from"
          type="date"
          value={filters.date_from}
          onChange={e => setFilter('date_from', e.target.value)}
          className={`h-8 text-[12px] rounded-lg border px-2.5 bg-white text-gray-700 transition-colors focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
            ${rangeActive ? 'border-blue-300 bg-blue-50/60 text-blue-700 font-medium' : 'border-black/[0.1]'}`}
          aria-label="Date from"
        />
      </div>
      <div>
        <label className="sr-only" htmlFor="date_to">Date to</label>
        <input
          id="date_to"
          type="date"
          value={filters.date_to}
          onChange={e => setFilter('date_to', e.target.value)}
          className={`h-8 text-[12px] rounded-lg border px-2.5 bg-white text-gray-700 transition-colors focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
            ${rangeActive ? 'border-blue-300 bg-blue-50/60 text-blue-700 font-medium' : 'border-black/[0.1]'}`}
          aria-label="Date to"
        />
      </div>
    </div>
  )

  return (
    <div className="bg-white/80 backdrop-blur-md border-b border-black/[0.06] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap flex-shrink-0 sticky top-0 z-20">
      <div>
        <h2 className="text-[16px] font-semibold text-gray-900 leading-tight tracking-tight">{meta.title}</h2>
        <p className="text-[11.5px] text-gray-500 mt-0.5">{meta.sub}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <SearchableSelect
          label="All Dates"
          value={filters.date}
          options={sortedDates}
          onChange={v => setFilter('date', v)}
          display={d => d.slice(5)}
        />
        {dateRangeInputs}
        {channelSelect}
        {!isAutomations && (
          <>
            <SearchableSelect
              label="All Campaign IDs"
              value={filters.campaign_id}
              options={campaignIds}
              onChange={v => setFilter('campaign_id', v)}
            />
            <SearchableSelect
              label="All Segments"
              value={filters.segment}
              options={segments}
              onChange={v => setFilter('segment', v)}
              display={s => s.length > 30 ? s.slice(0,30)+'…' : s}
            />
            <SearchableSelect
              label="All Offers"
              value={filters.offer}
              options={offers}
              onChange={v => setFilter('offer', v)}
            />
          </>
        )}
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
