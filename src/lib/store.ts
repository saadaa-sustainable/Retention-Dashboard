'use client'
import { create } from 'zustand'
import type { Campaign, Automation, GlobalFilters } from '@/types'

interface DashStore {
  // Data
  campaigns:   Campaign[]
  automations: Automation[]
  loading:     boolean
  error:       string | null

  // Filters
  filters: GlobalFilters

  // Actions
  setCampaigns:   (c: Campaign[]) => void
  setAutomations: (a: Automation[]) => void
  setLoading:     (v: boolean) => void
  setError:       (e: string | null) => void
  setFilter:      (key: keyof GlobalFilters, value: string) => void
  clearFilters:   () => void
  fetchCampaigns: () => Promise<void>
  fetchAutomations: () => Promise<void>
}

const DEFAULT_FILTERS: GlobalFilters = {
  date:      'ALL',
  campaign_id: 'ALL',
  segment:   'ALL',
  offer:     'ALL',
  channel:   'ALL',
  date_from: '',
  date_to:   '',
}

export const useDashStore = create<DashStore>((set, get) => ({
  campaigns:   [],
  automations: [],
  loading:     false,
  error:       null,
  filters:     DEFAULT_FILTERS,

  setCampaigns:   (campaigns)   => set({ campaigns }),
  setAutomations: (automations) => set({ automations }),
  setLoading:     (loading)     => set({ loading }),
  setError:       (error)       => set({ error }),

  setFilter: (key, value) =>
    set(s => {
      if (key === 'date') {
        return {
          filters: {
            ...s.filters,
            date: value,
            date_from: '',
            date_to: '',
          },
        }
      }
      if (key === 'date_from' || key === 'date_to') {
        return {
          filters: {
            ...s.filters,
            date: 'ALL',
            [key]: value,
          },
        }
      }
      return { filters: { ...s.filters, [key]: value } }
    }),

  clearFilters: () => set({ filters: DEFAULT_FILTERS }),

  fetchCampaigns: async () => {
    set({ loading: true, error: null })
    try {
      const f   = get().filters
      const params = new URLSearchParams()
      if (f.date       !== 'ALL') params.set('date',        f.date)
      if (f.campaign_id !== 'ALL') params.set('campaign_id', f.campaign_id)
      if (f.segment    !== 'ALL') params.set('segment',     f.segment)
      if (f.offer      !== 'ALL') params.set('offer',       f.offer)
      if (f.channel    !== 'ALL') params.set('channel',     f.channel)
      if (f.date_from)            params.set('date_from',   f.date_from)
      if (f.date_to)              params.set('date_to',     f.date_to)
      params.set('limit', '1000')

      const res  = await fetch(`/api/campaigns?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      set({ campaigns: json.data || [], loading: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ error: msg, loading: false })
    }
  },

  fetchAutomations: async () => {
    try {
      const f   = get().filters
      const params = new URLSearchParams()
      if (f.channel !== 'ALL') params.set('channel', f.channel)
      const res  = await fetch(`/api/automations?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      set({ automations: json.data || [] })
    } catch (e) {
      console.error('Failed to fetch automations:', e)
    }
  },
}))
