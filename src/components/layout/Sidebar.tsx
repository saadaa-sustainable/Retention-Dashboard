'use client'
import { BarChart2, Megaphone, Settings2, Target, Tag, TrendingDown, DollarSign, LineChart, Upload, RefreshCw, Sparkles } from 'lucide-react'

export type TabId =
  | 'overview' | 'campaigns' | 'automations'
  | 'segment' | 'offer' | 'funnel' | 'revenue' | 'historical'

const NAV = [
  { section: 'Analytics', items: [
    { id: 'overview'    as TabId, label: 'Overview',            icon: BarChart2   },
    { id: 'campaigns'   as TabId, label: 'Campaigns',           icon: Megaphone   },
    { id: 'automations' as TabId, label: 'Automations',         icon: Settings2   },
  ]},
  { section: 'Intelligence', items: [
    { id: 'segment'   as TabId, label: 'Segment Analytics',   icon: Target      },
    { id: 'offer'     as TabId, label: 'Offer Analytics',     icon: Tag         },
    { id: 'funnel'    as TabId, label: 'Funnel Analysis',     icon: TrendingDown },
    { id: 'revenue'   as TabId, label: 'Revenue & Conversion',icon: DollarSign  },
    { id: 'historical'as TabId, label: 'Historical Trends',   icon: LineChart   },
  ]},
]

interface SidebarProps {
  activeTab: TabId
  onTab: (t: TabId) => void
  onUpload: () => void
  onSync: () => void
  syncing: boolean
  lastSynced: string | null
}

export default function Sidebar({ activeTab, onTab, onUpload, onSync, syncing, lastSynced }: SidebarProps) {
  return (
    <aside className="w-[232px] min-w-[232px] bg-white/70 backdrop-blur-sm border-r border-black/[0.06] flex flex-col overflow-y-auto">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-black/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-sm shadow-blue-500/20">
            <Sparkles size={15} className="text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-[9px] text-gray-400 uppercase tracking-[0.14em] font-medium">Saadaa · Retention</p>
            <h1 className="text-[14px] font-semibold text-gray-900">KwikEngage</h1>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3">
        {NAV.map((group, gi) => (
          <div key={group.section} className={gi > 0 ? 'mt-4' : ''}>
            <p className="px-3 pb-1.5 text-[9.5px] uppercase tracking-[0.14em] text-gray-400 font-semibold">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon   = item.icon
                const active = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onTab(item.id)}
                    className={`relative w-full flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-[12.5px] text-left rounded-lg transition-colors duration-150
                      ${active
                        ? 'bg-blue-50/80 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100/70 hover:text-gray-900'}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-500" />
                    )}
                    <Icon size={15} className={`shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-black/[0.06] p-3 space-y-2">
        <button
          onClick={onUpload}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] rounded-lg bg-gray-900 text-white font-medium hover:bg-black transition-colors shadow-sm"
        >
          <Upload size={13} />
          Upload CSV
        </button>
        <button
          onClick={onSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] rounded-lg border border-black/[0.08] bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Shopify'}
        </button>
        {lastSynced && (
          <p className="text-[10px] text-gray-400 text-center pt-0.5">
            Last synced: {lastSynced}
          </p>
        )}
        <div className="flex items-center gap-1.5 justify-center pt-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[10px] text-gray-400">Included segments only</p>
        </div>
      </div>
    </aside>
  )
}
