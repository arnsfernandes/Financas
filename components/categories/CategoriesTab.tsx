'use client'

import React, { useState, useEffect } from 'react'
import {
  Plus,
  Search,
  Check,
  Edit2,
  Power,
  TrendingDown,
  TrendingUp,
  Tag,
  ChevronRight,
  Sparkles,
  AlertCircle,
  FolderOpen,
  Filter,
  X,
  Loader2,
} from 'lucide-react'
import type { Category } from '@/lib/schema'
import { formatBRL } from '@/lib/formatters'
import {
  getCategoryLucideIcon,
  CATEGORY_COLORS,
  AVAILABLE_CATEGORY_ICONS,
} from '@/lib/categoryIcons'

import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface CategoriesTabProps {
  onCategorySelect?: (categoryId: string, categoryName: string, type: 'expense' | 'income') => void
  periodData?: {
    startDate?: string
    endDate?: string
    label?: string
  }
}

interface CategoryWithStats extends Category {
  txCount?: number
  totalAmount?: number
}

export function CategoriesTab({ onCategorySelect, periodData }: CategoriesTabProps) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [activeType, setActiveType] = useState<'expense' | 'income'>('expense')
  const [categories, setCategories] = useState<CategoryWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<'expense' | 'income'>('expense')
  const [formIcon, setFormIcon] = useState('Tag')
  const [formColor, setFormColor] = useState('#2F68FE')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  // Carregar categorias e estatísticas do período
  async function fetchCategoriesData() {
    setLoading(true)
    setError('')
    try {
      // 1. Listar categorias
      const res = await fetchWithAuth(`/api/categories?type=all&activeOnly=false`)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Falha ao buscar categorias (${res.status})`)
      }

      const allCats: Category[] = data.categories || []

      // 2. Buscar transações do período para calcular quantidade e total de movimentação por categoria
      const txParams = new URLSearchParams()
      if (periodData?.startDate) txParams.append('startDate', periodData.startDate)
      if (periodData?.endDate) txParams.append('endDate', periodData.endDate)
      txParams.append('limit', '1000')

      const txRes = await fetchWithAuth(`/api/transactions?${txParams.toString()}`)
      const txData = await txRes.json()
      if (!txRes.ok && !txData.ok) {
        throw new Error(txData.error || `Falha ao carregar transações (${txRes.status})`)
      }
      const txList: any[] = txData.ok ? txData.transactions || [] : []

      // Agregar por category_id ou fallback
      const statsMap: Record<string, { count: number; total: number }> = {}

      for (const tx of txList) {
        const catId = tx.category_id || tx.categories?.id
        const amount = Math.abs(Number(tx.total) || 0)

        if (catId) {
          if (!statsMap[catId]) statsMap[catId] = { count: 0, total: 0 }
          statsMap[catId].count++
          statsMap[catId].total += amount
        }
      }

      const enriched: CategoryWithStats[] = allCats.map((cat) => ({
        ...cat,
        txCount: statsMap[cat.id]?.count || 0,
        totalAmount: statsMap[cat.id]?.total || 0,
      }))

      setCategories(enriched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategoriesData()
  }, [periodData?.startDate, periodData?.endDate])

  // Abrir modal de criação
  function handleOpenCreate() {
    setEditingCategory(null)
    setFormName('')
    setFormType(activeType)
    setFormIcon(activeType === 'income' ? 'TrendingUp' : 'Tag')
    setFormColor(CATEGORY_COLORS[0])
    setModalError('')
    setModalOpen(true)
  }

  // Abrir modal de edição
  function handleOpenEdit(cat: Category, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingCategory(cat)
    setFormName(cat.name)
    setFormType(cat.type)
    setFormIcon(cat.icon || 'Tag')
    setFormColor(cat.color || '#2F68FE')
    setModalError('')
    setModalOpen(true)
  }

  // Toggle Ativação / Desativação
  async function handleToggleActive(cat: Category, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const res = await fetchWithAuth(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !cat.active }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setCategories((prev) =>
          prev.map((c) => (c.id === cat.id ? { ...c, active: !c.active } : c))
        )
      } else {
        alert(data.error || `Não foi possível alterar o status da categoria (${res.status}).`)
      }
    } catch {
      alert('Erro de conexão ao alterar categoria.')
    }
  }

  // Submeter formulário do modal
  async function handleSubmitModal(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = formName.trim()
    if (!trimmedName) {
      setModalError('Informe o nome da categoria.')
      return
    }

    setModalLoading(true)
    setModalError('')

    try {
      if (editingCategory) {
        // Atualizar
        const res = await fetchWithAuth(`/api/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            icon: formIcon,
            color: formColor,
          }),
        })
        const data = await res.json()
        if (res.ok && data.ok && data.category) {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === editingCategory.id ? { ...c, ...data.category } : c
            )
          )
          setModalOpen(false)
        } else {
          setModalError(data.error || `Erro ao atualizar categoria (${res.status}).`)
        }
      } else {
        // Criar
        const res = await fetchWithAuth('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            type: formType,
            icon: formIcon,
            color: formColor,
          }),
        })
        const data = await res.json()
        if (res.ok && data.ok && data.category) {
          setCategories((prev) => [...prev, { ...data.category, txCount: 0, totalAmount: 0 }])
          setModalOpen(false)
        } else {
          setModalError(data.error || `Erro ao criar categoria (${res.status}).`)
        }
      }
    } catch {
      setModalError('Erro de conexão ao salvar categoria.')
    } finally {
      setModalLoading(false)
    }
  }

  // Filtragem local
  const displayedCategories = categories.filter((cat) => {
    if (cat.type !== activeType) return false
    if (!showInactive && !cat.active) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        cat.name.toLowerCase().includes(q) ||
        (cat.normalized_name ? cat.normalized_name.toLowerCase().includes(q) : false)
      )
    }
    return true
  })

  // Contadores
  const activeCount = categories.filter((c) => c.type === activeType && c.active).length
  const inactiveCount = categories.filter((c) => c.type === activeType && !c.active).length

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 1. Header com Título e Ação de Nova Categoria */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EBEEF2]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Categorias
          </h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Organize suas despesas e receitas com categorias estruturadas e personalizáveis.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2F68FE] hover:bg-[#1D52EB] text-white text-xs font-semibold rounded-xl shadow-copilot-button transition-all hover:scale-[1.01] active:scale-[0.99] shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nova Categoria</span>
        </button>
      </div>

      {/* Alerta de Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchCategoriesData()}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline ml-auto"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* 2. Barra de Controle: Tabs Tipo, Pesquisa e Switch Inativos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 border border-[#EBEEF2] rounded-2xl shadow-xs">
        {/* Toggle Despesas vs Receitas */}
        <div className="flex bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB] shrink-0">
          <button
            onClick={() => setActiveType('expense')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeType === 'expense'
                ? 'bg-white text-red-600 shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Despesas ({categories.filter((c) => c.type === 'expense' && c.active).length})</span>
          </button>
          <button
            onClick={() => setActiveType('income')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeType === 'income'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Receitas ({categories.filter((c) => c.type === 'income' && c.active).length})</span>
          </button>
        </div>

        {/* Busca e Filtro de Inativas */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoria..."
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white focus:border-[#2F68FE] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-[#9CA3AF] hover:text-[#111827]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-all ${
              showInactive
                ? 'bg-[#EBF2FF] border-[#2F68FE] text-[#2F68FE] font-semibold'
                : 'bg-white border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
            }`}
            title="Mostrar ou ocultar categorias desativadas"
          >
            {showInactive ? 'Todas' : 'Somente Ativas'}
            {inactiveCount > 0 && !showInactive && (
              <span className="ml-1.5 text-[10px] bg-[#F4F5F7] px-1.5 py-0.2 rounded-full text-[#6B7280]">
                +{inactiveCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Lista de Categorias em Grid Compacto */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#9CA3AF] text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#2F68FE]" />
          <span>Carregando categorias...</span>
        </div>
      ) : displayedCategories.length === 0 ? (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F4F5F7] text-[#9CA3AF] mx-auto flex items-center justify-center">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#111827]">Nenhuma categoria encontrada</h3>
            <p className="text-xs text-[#6B7280]">
              {search
                ? `Nenhuma categoria corresponde à busca "${search}".`
                : 'Crie uma nova categoria para começar a organizar seus lançamentos.'}
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#2F68FE] bg-[#EBF2FF] hover:bg-[#DDE9FF] rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Criar Nova Categoria</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl shadow-xs overflow-hidden divide-y divide-[#F4F5F7]">
          {displayedCategories.map((cat) => {
            const IconComponent = getCategoryLucideIcon(cat.icon)
            const isInactive = !cat.active

            return (
              <div
                key={cat.id}
                onClick={() => onCategorySelect?.(cat.id, cat.name, cat.type)}
                className={`flex items-center justify-between p-3.5 sm:px-5 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${
                  isInactive ? 'opacity-60 bg-[#FAFAFA]' : ''
                }`}
              >
                {/* Lado Esquerdo: Ícone + Nome + Badge Sistema + Status */}
                <div className="flex items-center gap-3.5 min-w-0 pr-2">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-2xs transition-transform group-hover:scale-105"
                    style={{ backgroundColor: cat.color || '#2F68FE' }}
                  >
                    <IconComponent className="w-4 h-4 stroke-[2.5]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                        {cat.name}
                      </span>

                      {cat.is_system ? (
                        <span className="text-[10px] font-medium text-[#6B7280] bg-[#F4F5F7] px-1.5 py-0.2 rounded border border-[#E5E7EB]">
                          Padrão
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-[#2F68FE] bg-[#EBF2FF] px-1.5 py-0.2 rounded border border-[#DDE9FF]">
                          Personalizada
                        </span>
                      )}

                      {isInactive && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                          Desativada
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#6B7280] mt-0.5">
                      <span>{cat.txCount || 0} {cat.txCount === 1 ? 'lançamento' : 'lançamentos'}</span>
                      {periodData?.label && <span>no período ({periodData.label})</span>}
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Total Movimentado + Ações (Editar, Ativar/Desativar) + Chevron */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span
                      className={`text-xs sm:text-sm font-bold block ${
                        cat.type === 'income' ? 'text-[#10B981]' : 'text-[#111827]'
                      }`}
                    >
                      {formatBRL(cat.totalAmount || 0)}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF]">
                      {periodData?.label ? 'no período' : 'total'}
                    </span>
                  </div>

                  {/* Ações em Hover */}
                  <div className="flex items-center gap-1 pl-2 border-l border-[#EBEEF2]">
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(cat, e)}
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
                      title="Editar nome, ícone ou cor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleToggleActive(cat, e)}
                      disabled={cat.is_system && cat.normalized_name === 'outros'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        cat.active
                          ? 'text-[#9CA3AF] hover:text-amber-600 hover:bg-amber-50'
                          : 'text-[#9CA3AF] hover:text-emerald-600 hover:bg-emerald-50'
                      } ${cat.is_system && cat.normalized_name === 'outros' ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title={
                        cat.is_system && cat.normalized_name === 'outros'
                          ? 'Categoria obrigatória de fallback do sistema'
                          : cat.active
                          ? 'Desativar categoria'
                          : 'Ativar categoria'
                      }
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    <ChevronRight className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#2F68FE] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 4. Modal Criar / Editar Categoria */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-[#EBEEF2] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#EBEEF2] flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#111827]">
                  {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                </h3>
                <p className="text-[11px] text-[#6B7280]">
                  {editingCategory
                    ? 'Altere o nome exibido, o ícone e a cor de destaque.'
                    : `Cadastre uma nova categoria de ${formType === 'income' ? 'receita' : 'despesa'}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] text-lg p-1 rounded-xl hover:bg-[#F4F5F7] transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="p-4 space-y-4 text-xs">
              {modalError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Tipo (apenas se for criação) */}
              {!editingCategory && (
                <div>
                  <label className="text-[11px] font-semibold text-[#4B5563] block mb-1">
                    Tipo
                  </label>
                  <div className="flex bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setFormType('expense')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        formType === 'expense'
                          ? 'bg-white text-red-600 shadow-xs'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      Despesa
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType('income')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        formType === 'income'
                          ? 'bg-white text-emerald-600 shadow-xs'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      Receita
                    </button>
                  </div>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Assinaturas, Restaurantes, Salário..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white focus:border-[#2F68FE] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none transition-all"
                />
              </div>

              {/* Seletor de Cores */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1.5">
                  Cor de Destaque
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        formColor === color
                          ? 'scale-120 ring-2 ring-offset-2 ring-[#111827]'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Seletor de Ícones */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1.5">
                  Ícone Lucide
                </label>
                <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-[#F9FAFB] rounded-xl border border-[#EBEEF2]">
                  {AVAILABLE_CATEGORY_ICONS.map((iconName) => {
                    const IconComp = getCategoryLucideIcon(iconName)
                    const isSelected = formIcon === iconName
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setFormIcon(iconName)}
                        className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#2F68FE] text-white shadow-xs'
                            : 'text-[#6B7280] hover:bg-[#EBEEF2] hover:text-[#111827]'
                        }`}
                        title={iconName}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="flex gap-2 pt-2 border-t border-[#EBEEF2]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2 text-xs text-[#6B7280] hover:bg-[#F4F5F7] rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 py-2 text-xs bg-[#2F68FE] hover:bg-[#1D52EB] text-white font-semibold rounded-xl transition-all shadow-copilot-button disabled:opacity-50"
                >
                  {modalLoading ? 'Salvando...' : editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
