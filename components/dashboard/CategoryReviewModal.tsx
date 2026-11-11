'use client'

/**
 * Revisar categorias por loja: cada loja aparece uma vez. Ao trocar a categoria, ela vale para todos os
 * lançamentos dessa loja e o app lembra nas próximas faturas e extratos.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

interface VendorRow {
  vendor: string
  category: string
  mixed: boolean
  count: number
  total: number
  lastDate: string
  methods: string[]
}

export function CategoryReviewModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [onlyOthers, setOnlyOthers] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    fetchWithAuth('/api/categories/review')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error)
        setVendors(d.vendors)
        setCategories(d.categories)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar.'))
      .finally(() => setLoading(false))
  }, [open, fetchWithAuth])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors.filter((v) => (!onlyOthers || v.category === 'Outros') && (!q || v.vendor.toLowerCase().includes(q)))
  }, [vendors, query, onlyOthers])

  async function change(v: VendorRow, category: string) {
    setSaving(v.vendor)
    setError('')
    try {
      const res = await fetchWithAuth('/api/categories/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: v.vendor, category }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setVendors((prev) => prev.map((x) => (x.vendor === v.vendor ? { ...x, category, mixed: false } : x)))
      setSaved((prev) => new Set(prev).add(v.vendor))
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setSaving(null)
    }
  }

  if (!open) return null
  const others = vendors.filter((v) => v.category === 'Outros').length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Revisar categorias por loja" onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Revisar categorias por loja</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Troque uma vez: vale para todos os lançamentos da loja e para as próximas faturas e extratos.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar loja"
                className="flex-1 bg-transparent text-sm focus:outline-none" />
            </label>
            <button type="button" onClick={() => setOnlyOthers((v) => !v)}
              className={`text-xs font-medium rounded-xl px-3 py-2 border ${onlyOthers ? 'bg-amber-50 border-amber-200 text-amber-800' : 'border-slate-200 text-slate-600'}`}>
              Só "Outros" ({others})
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-3 sm:px-4 py-2">
          {loading && <p className="flex items-center justify-center gap-2 text-xs text-slate-400 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Carregando lojas…</p>}
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 my-2">{error}</p>}
          {!loading && (
            <ul className="divide-y divide-slate-100">
              {shown.map((v) => (
                <li key={v.vendor} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5">
                  <span className="flex-1 min-w-[10rem]">
                    <span className="block text-sm text-slate-900 truncate">{v.vendor}</span>
                    <span className="block text-[11px] text-slate-400">
                      {v.count} compra(s) · {formatBRL(v.total)} · {v.methods.join(', ') || '—'}
                      {v.mixed && ' · categorias diferentes'}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {saving === v.vendor ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : saved.has(v.vendor) ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                    <select value={v.category} onChange={(e) => change(v, e.target.value)} disabled={saving === v.vendor}
                      aria-label={`Categoria de ${v.vendor}`}
                      className={`rounded-lg px-2 py-1.5 text-xs focus:outline-none ${v.category === 'Outros' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {Array.from(new Set([...categories, v.category])).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </span>
                </li>
              ))}
              {shown.length === 0 && <li className="text-center text-xs text-slate-400 py-10">Nenhuma loja encontrada.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
