'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import type { Receipt } from '@/lib/schema'

function formatBRL(value?: number | null) {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

interface TransactionItem {
  id: string
  description: string
  normalized_name?: string | null
  quantity?: number | null
  unit_price?: number | null
  total?: number | null
  category?: string | null
}

interface TransactionRecord {
  id: string
  vendor: string | null
  vendor_address: string | null
  date: string | null
  time: string | null
  currency: string
  category: string | null
  subtotal: number | null
  tax: number | null
  tip: number | null
  total: number
  payment_method: string | null
  notes: string | null
  source_type: string
  created_at: string
  transaction_items?: TransactionItem[]
}

interface ItemReportData {
  product: string
  total_spent: number
  occurrences: number
  total_quantity: number | null
  average_price: number | null
  min_price: number | null
  max_price: number | null
  purchases: {
    transaction_id: string
    vendor: string | null
    date: string | null
    currency: string
    description: string
    quantity: number | null
    unit_price: number | null
    total: number | null
    item_category: string | null
    created_at: string
  }[]
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'new' | 'transactions' | 'reports'>('new')

  // Nova Despesa State
  const [inputType, setInputType] = useState<'text' | 'image'>('text')
  const [textInput, setTextInput] = useState('')
  const [loadingNew, setLoadingNew] = useState(false)
  const [newError, setNewError] = useState('')
  const [lastScanned, setLastScanned] = useState<Receipt | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Transações State
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loadingTx, setLoadingTx] = useState(false)
  const [txError, setTxError] = useState('')
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

  // Consulta / Filtros State
  const [filterProduct, setFilterProduct] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterItemCategory, setFilterItemCategory] = useState('')
  const [itemReport, setItemReport] = useState<ItemReportData | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportError, setReportError] = useState('')

  // Carregar transações
  async function fetchTransactions() {
    setLoadingTx(true)
    setTxError('')
    try {
      const res = await fetch('/api/transactions?limit=30')
      const data = await res.json()
      if (data.ok) {
        setTransactions(data.transactions || [])
      } else {
        setTxError(data.error || 'Erro ao carregar transações')
      }
    } catch {
      setTxError('Erro de conexão ao carregar transações')
    } finally {
      setLoadingTx(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  // Submeter Nova Despesa
  async function handleSubmitExpense(e: FormEvent) {
    e.preventDefault()
    setLoadingNew(true)
    setNewError('')
    setLastScanned(null)

    try {
      if (inputType === 'text') {
        if (!textInput.trim()) {
          setNewError('Por favor, digite a descrição da despesa.')
          setLoadingNew(false)
          return
        }

        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textInput }),
        })
        const data = await res.json()
        if (data.ok) {
          setLastScanned(data.receipt)
          setTextInput('')
          fetchTransactions()
        } else {
          setNewError(data.error || 'Falha ao processar despesa')
        }
      } else {
        const files = fileRef.current?.files
        if (!files || files.length === 0) {
          setNewError('Por favor, selecione uma imagem.')
          setLoadingNew(false)
          return
        }

        const fd = new FormData()
        fd.append('file', files[0])

        const res = await fetch('/api/scan', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (data.ok) {
          setLastScanned(data.receipt)
          if (fileRef.current) fileRef.current.value = ''
          fetchTransactions()
        } else {
          setNewError(data.error || 'Falha ao processar imagem')
        }
      }
    } catch {
      setNewError('Erro de conexão ao enviar despesa')
    } finally {
      setLoadingNew(false)
    }
  }

  // Executar Consulta / Relatório de Itens
  async function handleFilterSearch(e?: FormEvent) {
    if (e) e.preventDefault()
    setLoadingReport(true)
    setReportError('')

    try {
      const params = new URLSearchParams()
      if (filterProduct.trim()) params.append('product', filterProduct.trim())
      if (filterVendor.trim()) params.append('vendor', filterVendor.trim())
      if (filterStartDate) params.append('startDate', filterStartDate)
      if (filterEndDate) params.append('endDate', filterEndDate)
      if (filterCategory.trim()) params.append('category', filterCategory.trim())
      if (filterItemCategory.trim()) params.append('itemCategory', filterItemCategory.trim())

      const res = await fetch(`/api/reports/items?${params.toString()}`)
      const data = await res.json()
      if (data.ok) {
        setItemReport(data.report)
      } else {
        setReportError(data.error || 'Erro ao consultar itens')
      }
    } catch {
      setReportError('Erro de conexão ao consultar')
    } finally {
      setLoadingReport(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-5xl mx-auto font-sans">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
              Controle Financeiro Inteligente
            </h1>
            <p className="text-zinc-400 text-sm">
              Lance despesas por texto ou imagem e consulte seus gastos por item e mercado.
            </p>
          </div>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 w-fit">
            OpenAI + Supabase
          </span>
        </div>

        {/* Navegação entre as 3 Áreas */}
        <div className="flex gap-2 border-b border-white/10 mt-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'new'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            1. Nova Despesa
          </button>
          <button
            onClick={() => {
              setActiveTab('transactions')
              fetchTransactions()
            }}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'transactions'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            2. Transações ({transactions.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('reports')
              if (!itemReport) handleFilterSearch()
            }}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'reports'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            3. Consulta & Relatórios
          </button>
        </div>
      </header>

      {/* ÁREA 1: NOVA DESPESA */}
      {activeTab === 'new' && (
        <section className="space-y-6">
          <form onSubmit={handleSubmitExpense} className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
            <h2 className="text-lg font-semibold text-white mb-4">Registrar Gasto</h2>

            {/* Alternar Texto / Imagem */}
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="inputType"
                  checked={inputType === 'text'}
                  onChange={() => setInputType('text')}
                  className="accent-violet-500"
                />
                Texto / Descrição
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="inputType"
                  checked={inputType === 'image'}
                  onChange={() => setInputType('image')}
                  className="accent-violet-500"
                />
                Foto de Recibo / Nota / Manuscrito
              </label>
            </div>

            {inputType === 'text' ? (
              <div className="space-y-3">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Ex: Hoje fui ao Carrefour e gastei R$ 84,30. Comprei macarrão por R$ 8,50, arroz por R$ 28,90, leite por R$ 32,00 e sabão por R$ 14,90."
                  rows={3}
                  className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="w-full text-sm text-zinc-300 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-violet-500 file:text-white file:font-medium hover:file:bg-violet-400 cursor-pointer"
                />
                <p className="text-xs text-zinc-500">
                  Aceita fotos de recibos, cupons fiscais, anotações manuscritas ou notas de compras.
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="submit"
                disabled={loadingNew}
                className="px-6 py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                {loadingNew ? 'Processando com IA…' : 'Processar e Salvar'}
              </button>
            </div>
          </form>

          {newError && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-lg px-4 py-3 text-sm">
              {newError}
            </div>
          )}

          {/* Resumo do Último Lançamento */}
          {lastScanned && (
            <div className="border border-emerald-500/30 bg-emerald-500/[0.04] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  ✓ Despesa Registrada e Salva no Banco
                </span>
                <span className="text-xs text-zinc-400">{lastScanned.currency || 'BRL'}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-xs text-zinc-500 block">Estabelecimento</span>
                  <span className="text-sm font-semibold text-white">{lastScanned.vendor || 'Não identificado'}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-xs text-zinc-500 block">Valor Total</span>
                  <span className="text-sm font-semibold text-emerald-400">{formatBRL(lastScanned.total)}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-xs text-zinc-500 block">Categoria Geral</span>
                  <span className="text-sm font-medium text-zinc-200">{lastScanned.category || 'Outros'}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-xs text-zinc-500 block">Itens</span>
                  <span className="text-sm font-medium text-zinc-200">{lastScanned.items.length} produto(s)</span>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Itens Extraídos:</h3>
              <table className="w-full text-sm mb-4">
                <thead className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/10">
                  <tr>
                    <th className="text-left py-2">Item</th>
                    <th className="text-left py-2">Categoria</th>
                    <th className="text-right py-2">Qtd</th>
                    <th className="text-right py-2">Unitário</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {lastScanned.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2 text-zinc-200">{it.description}</td>
                      <td className="py-2 text-xs text-violet-300">{it.category || '—'}</td>
                      <td className="py-2 text-right text-zinc-400">{it.quantity ?? 1}</td>
                      <td className="py-2 text-right text-zinc-400">{formatBRL(it.unit_price)}</td>
                      <td className="py-2 text-right font-medium text-zinc-200">{formatBRL(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ÁREA 2: TRANSAÇÕES SALVAS */}
      {activeTab === 'transactions' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Transações Recentes</h2>
            <button
              onClick={fetchTransactions}
              disabled={loadingTx}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {loadingTx ? 'Carregando…' : '↻ Atualizar'}
            </button>
          </div>

          {txError && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-lg px-4 py-3 text-sm">
              {txError}
            </div>
          )}

          {loadingTx && transactions.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Carregando transações do banco…</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 border border-white/5 rounded-2xl text-zinc-500 text-sm">
              Nenhuma transação cadastrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => {
                const isExpanded = expandedTxId === tx.id
                return (
                  <div
                    key={tx.id}
                    className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden transition-colors hover:border-white/20"
                  >
                    <div
                      onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">
                          {tx.source_type === 'image' ? '📷' : '📝'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-white">
                              {tx.vendor || 'Sem estabelecimento'}
                            </h3>
                            {tx.category && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                                {tx.category}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {tx.date || new Date(tx.created_at).toLocaleDateString('pt-BR')}
                            {tx.time ? ` às ${tx.time}` : ''} • {tx.transaction_items?.length || 0} item(ns)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="text-base font-semibold text-emerald-400">
                          {formatBRL(tx.total)}
                        </span>
                        <span className="text-xs text-zinc-500">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Detalhes expandidos */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-white/5 bg-black/20">
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Itens da Compra:
                        </h4>
                        {tx.transaction_items && tx.transaction_items.length > 0 ? (
                          <table className="w-full text-xs">
                            <thead className="text-zinc-500 uppercase tracking-wider">
                              <tr>
                                <th className="text-left py-1">Produto</th>
                                <th className="text-left py-1">Categoria</th>
                                <th className="text-right py-1">Qtd</th>
                                <th className="text-right py-1">Unitário</th>
                                <th className="text-right py-1">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {tx.transaction_items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1.5 text-zinc-200">{item.description}</td>
                                  <td className="py-1.5 text-violet-300">{item.category || '—'}</td>
                                  <td className="py-1.5 text-right text-zinc-400">{item.quantity ?? 1}</td>
                                  <td className="py-1.5 text-right text-zinc-400">{formatBRL(item.unit_price)}</td>
                                  <td className="py-1.5 text-right font-medium text-zinc-200">
                                    {formatBRL(item.total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-zinc-500">Nenhum item individual listado.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ÁREA 3: CONSULTA & RELATÓRIOS */}
      {activeTab === 'reports' && (
        <section className="space-y-6">
          <form onSubmit={handleFilterSearch} className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
            <h2 className="text-lg font-semibold text-white mb-4">Filtrar por Produto, Mercado ou Período</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Produto / Item</label>
                <input
                  type="text"
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  placeholder="Ex: macarrão, arroz..."
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Estabelecimento</label>
                <input
                  type="text"
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                  placeholder="Ex: Carrefour, Pão de Açúcar..."
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Categoria da Transação</label>
                <input
                  type="text"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  placeholder="Ex: Groceries, Dining..."
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Categoria do Item</label>
                <input
                  type="text"
                  value={filterItemCategory}
                  onChange={(e) => setFilterItemCategory(e.target.value)}
                  placeholder="Ex: Pantry, Dairy, Cleaning..."
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Data Final</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loadingReport}
                className="px-5 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-medium text-sm transition-colors"
              >
                {loadingReport ? 'Consultando…' : 'Aplicar Filtros'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterProduct('')
                  setFilterVendor('')
                  setFilterCategory('')
                  setFilterItemCategory('')
                  setFilterStartDate('')
                  setFilterEndDate('')
                  setTimeout(() => handleFilterSearch(), 0)
                }}
                className="px-4 py-2 rounded-lg border border-white/15 hover:border-white/30 text-zinc-300 text-sm font-medium transition-colors"
              >
                Limpar
              </button>
            </div>
          </form>

          {reportError && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-lg px-4 py-3 text-sm">
              {reportError}
            </div>
          )}

          {/* Cards de Métricas do Filtro */}
          {itemReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                  <span className="text-xs text-zinc-400 block mb-1">Total Gasto</span>
                  <span className="text-xl font-bold text-emerald-400">
                    {formatBRL(itemReport.total_spent)}
                  </span>
                </div>

                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                  <span className="text-xs text-zinc-400 block mb-1">Ocorrências / Compras</span>
                  <span className="text-xl font-bold text-white">
                    {itemReport.occurrences}
                  </span>
                </div>

                {itemReport.average_price !== null && (
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                    <span className="text-xs text-zinc-400 block mb-1">Preço Médio</span>
                    <span className="text-xl font-bold text-zinc-200">
                      {formatBRL(itemReport.average_price)}
                    </span>
                  </div>
                )}

                {itemReport.min_price !== null && itemReport.max_price !== null && (
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                    <span className="text-xs text-zinc-400 block mb-1">Faixa de Preço</span>
                    <span className="text-sm font-semibold text-zinc-300">
                      {formatBRL(itemReport.min_price)} ~ {formatBRL(itemReport.max_price)}
                    </span>
                  </div>
                )}
              </div>

              {/* Lista das Compras Correspondentes */}
              <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
                <h3 className="text-sm font-semibold text-white mb-4">
                  Compras Correspondentes ({itemReport.purchases.length})
                </h3>

                {itemReport.purchases.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhum item encontrado para os filtros selecionados.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/10">
                      <tr>
                        <th className="text-left py-2">Item</th>
                        <th className="text-left py-2">Estabelecimento</th>
                        <th className="text-left py-2">Data</th>
                        <th className="text-right py-2">Qtd</th>
                        <th className="text-right py-2">Unitário</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {itemReport.purchases.map((p, idx) => (
                        <tr key={idx}>
                          <td className="py-2 text-zinc-200">
                            <div>{p.description}</div>
                            {p.item_category && (
                              <span className="text-[10px] text-violet-400">{p.item_category}</span>
                            )}
                          </td>
                          <td className="py-2 text-zinc-400">{p.vendor || '—'}</td>
                          <td className="py-2 text-zinc-400">
                            {p.date || new Date(p.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2 text-right text-zinc-400">{p.quantity ?? 1}</td>
                          <td className="py-2 text-right text-zinc-400">{formatBRL(p.unit_price)}</td>
                          <td className="py-2 text-right font-medium text-emerald-400">
                            {formatBRL(p.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="mt-16 text-xs text-zinc-600 text-center">
        Controle Financeiro • Processamento com OpenAI GPT-4o & Supabase PostgreSQL
      </footer>
    </main>
  )
}
