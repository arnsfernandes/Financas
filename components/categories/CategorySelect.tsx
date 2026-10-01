'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  ChevronDown,
  Plus,
  Check,
  Tag,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import type { Category } from '@/lib/schema'
import {
  getCategoryLucideIcon,
  CATEGORY_COLORS,
  AVAILABLE_CATEGORY_ICONS,
} from '@/lib/categoryIcons'

import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface CategorySelectProps {
  type: 'expense' | 'income'
  value?: string | null // category_id
  fallbackName?: string | null // nome livre da transação para exibição caso category_id não exista ainda
  onChange: (categoryId: string, categoryName: string) => void
  highlightReview?: boolean
  className?: string
  placeholder?: string
  disabled?: boolean
}

export function CategorySelect({
  type,
  value,
  fallbackName,
  onChange,
  highlightReview = false,
  className = '',
  placeholder = 'Selecione uma categoria...',
  disabled = false,
}: CategorySelectProps) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Inline Creation State
  const [isCreating, setIsCreating] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('Tag')
  const [newCatColor, setNewCatColor] = useState('#2F68FE')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch categories when type changes
  useEffect(() => {
    let isMounted = true
    async function fetchCategories() {
      setLoading(true)
      setFetchError('')
      try {
        const res = await fetchWithAuth(`/api/categories?type=${type}&activeOnly=true`)
        const data = await res.json()
        if (isMounted) {
          if (data.ok && Array.isArray(data.categories)) {
            setCategories(data.categories)
          } else {
            setFetchError(data.error || 'Erro ao carregar categorias')
          }
        }
      } catch (err) {
        if (isMounted) {
          setFetchError('Erro de conexão ao carregar categorias')
        }
        console.error('Failed to load categories', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchCategories()
    return () => {
      isMounted = false
    }
  }, [type, fetchWithAuth])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setIsCreating(false)
        setCreateError('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Selected Category
  const selectedCategory = categories.find((c) => c.id === value)
  const SelectedIcon = selectedCategory ? getCategoryLucideIcon(selectedCategory.icon) : Tag

  // Filtered categories
  const filteredCategories = categories.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.normalized_name ? c.normalized_name.toLowerCase().includes(q) : false)
    )
  })

  // Start inline creation with prefilled search text if any
  function handleStartCreate() {
    setIsCreating(true)
    setNewCatName(search.trim())
    setNewCatIcon(type === 'income' ? 'TrendingUp' : 'Tag')
    setNewCatColor(CATEGORY_COLORS[0])
    setCreateError('')
  }

  // Handle inline submit
  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) {
      setCreateError('Digite o nome da categoria')
      return
    }

    setCreateLoading(true)
    setCreateError('')

    try {
      const res = await fetchWithAuth('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          type,
          icon: newCatIcon,
          color: newCatColor,
        }),
      })
      const data = await res.json()
      if (data.ok && data.category) {
        const created: Category = data.category
        setCategories((prev) => [...prev, created])
        onChange(created.id, created.name)
        setIsCreating(false)
        setOpen(false)
        setSearch('')
      } else {
        setCreateError(data.error || 'Erro ao criar categoria')
      }
    } catch {
      setCreateError('Erro de conexão ao salvar categoria')
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-xl border transition-all text-left ${
          highlightReview
            ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400/20 text-[#111827]'
            : 'border-[#E5E7EB] hover:border-[#D1D5DB] bg-[#F9FAFB] hover:bg-white text-[#111827] focus:border-[#2F68FE] focus:ring-2 focus:ring-[#2F68FE]/20'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedCategory ? (
            <>
              <span
                className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-white shadow-xs"
                style={{ backgroundColor: selectedCategory.color || '#2F68FE' }}
              >
                <SelectedIcon className="w-3 h-3 stroke-[2.5]" />
              </span>
              <span className="font-semibold text-[#111827] truncate">
                {selectedCategory.name}
              </span>
            </>
          ) : fallbackName ? (
            <>
              <span className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 bg-[#E5E7EB] text-[#6B7280]">
                <Tag className="w-3 h-3" />
              </span>
              <span className="font-medium text-[#4B5563] truncate italic">
                {fallbackName}
              </span>
            </>
          ) : (
            <span className="text-[#6B7280] font-normal truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[#6B7280]">
          {highlightReview && (
            <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
              Revisar
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Popover / Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-full min-w-[260px] max-w-sm bg-white border border-[#EBEEF2] rounded-2xl shadow-xl p-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
          {!isCreating ? (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar categoria..."
                  className="w-full bg-[#F4F5F7] border border-transparent focus:border-[#2F68FE] focus:bg-white rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none transition-all"
                />
              </div>

              {fetchError && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-1.5 text-[11px] text-rose-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fetchError}</span>
                </div>
              )}

              {/* List */}
              <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-[#9CA3AF] text-xs gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2F68FE]" />
                    <span>Carregando...</span>
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="py-4 px-2 text-center space-y-2">
                    <p className="text-xs text-[#6B7280]">
                      Nenhuma categoria encontrada para &ldquo;{search}&rdquo;.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartCreate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2F68FE] bg-[#EBF2FF] hover:bg-[#DDE9FF] rounded-xl transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Criar &ldquo;{search.trim() || 'Nova'}&rdquo;</span>
                    </button>
                  </div>
                ) : (
                  filteredCategories.map((cat) => {
                    const CatIcon = getCategoryLucideIcon(cat.icon)
                    const isSelected = cat.id === value
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onChange(cat.id, cat.name)
                          setOpen(false)
                          setSearch('')
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors group ${
                          isSelected
                            ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                            : 'text-[#374151] hover:bg-[#F4F5F7] hover:text-[#111827]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-white shadow-2xs"
                            style={{ backgroundColor: cat.color || '#2F68FE' }}
                          >
                            <CatIcon className="w-3 h-3 stroke-[2.5]" />
                          </span>
                          <span className="truncate">{cat.name}</span>
                          {cat.is_system && (
                            <span className="text-[9px] text-[#9CA3AF] bg-[#F4F5F7] px-1.5 py-0.2 rounded">
                              Sistema
                            </span>
                          )}
                        </div>

                        {isSelected && <Check className="w-3.5 h-3.5 text-[#2F68FE] shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Botão de Nova Categoria Inline */}
              <div className="pt-1.5 border-t border-[#EBEEF2]">
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] rounded-xl transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Nova Categoria</span>
                </button>
              </div>
            </>
          ) : (
            /* Formulário Inline de Criação */
            <form onSubmit={handleCreateCategory} className="space-y-3 p-1">
              <div className="flex items-center justify-between pb-1 border-b border-[#EBEEF2]">
                <span className="text-xs font-bold text-[#111827]">
                  Nova Categoria ({type === 'income' ? 'Receita' : 'Despesa'})
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-[11px] text-[#6B7280] hover:text-[#111827]"
                >
                  Voltar
                </button>
              </div>

              {createError && (
                <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ex: Assinaturas, Cursos, Bônus..."
                  className="w-full bg-[#F4F5F7] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none"
                />
              </div>

              {/* Seletor de Cor */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1">
                  Cor
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        newCatColor === c ? 'scale-125 ring-2 ring-offset-1 ring-[#111827]' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Seletor de Ícone */}
              <div>
                <label className="text-[11px] font-semibold text-[#4B5563] block mb-1">
                  Ícone
                </label>
                <div className="grid grid-cols-6 gap-1 max-h-24 overflow-y-auto p-1 bg-[#F9FAFB] rounded-xl border border-[#EBEEF2]">
                  {AVAILABLE_CATEGORY_ICONS.map((iconName) => {
                    const IconComp = getCategoryLucideIcon(iconName)
                    const isIconSelected = newCatIcon === iconName
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setNewCatIcon(iconName)}
                        className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${
                          isIconSelected
                            ? 'bg-[#2F68FE] text-white shadow-xs'
                            : 'text-[#6B7280] hover:bg-[#EBEEF2] hover:text-[#111827]'
                        }`}
                        title={iconName}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-1.5 text-xs text-[#6B7280] hover:bg-[#F4F5F7] rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-1.5 text-xs bg-[#2F68FE] hover:bg-[#1D52EB] text-white font-semibold rounded-xl transition-all shadow-copilot-button disabled:opacity-50"
                >
                  {createLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
