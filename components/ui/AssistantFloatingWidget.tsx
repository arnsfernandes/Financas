'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  X,
  Send,
  Minimize2,
  Bot,
  User,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  TrendingUp,
  Table as TableIcon,
} from 'lucide-react'

import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import type {
  AssistantStructuredResponse,
  AssistantSummaryCard,
  AssistantTableBlock,
  AssistantChartBlock,
  AssistantExportBlock,
} from '@/lib/assistant'

export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text?: string
  card?: AssistantSummaryCard | null
  table?: AssistantTableBlock | null
  chart?: AssistantChartBlock | null
  export?: AssistantExportBlock | null
  timestamp: string
}

const SUGGESTIONS = [
  'Quanto gastei este mês?',
  'Quanto gastei com mercado nos últimos 6 meses?',
  'Quais foram meus maiores gastos?',
  'Como está minha fatura do Inter?',
  'Quanto ainda tenho de parcelas até dezembro?',
  'Quanto tenho de saldo?',
  'Exporte minhas despesas deste mês',
]

/**
 * Compact CSS-only Bar & Donut chart renderer
 */
function CompactChartRenderer({ chart }: { chart: AssistantChartBlock }) {
  const maxVal = Math.max(...chart.data, 1)

  if (chart.type === 'bar') {
    return (
      <div className="mt-2.5 p-3 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-2">
        {chart.title && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1F2937]">
            <TrendingUp className="w-3.5 h-3.5 text-[#2F68FE]" />
            <span>{chart.title}</span>
          </div>
        )}
        <div className="space-y-1.5 pt-1">
          {chart.labels.map((label, idx) => {
            const val = chart.data[idx] || 0
            const pct = Math.max(8, Math.min(100, Math.round((val / maxVal) * 100)))
            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between text-[11px] text-[#4B5563]">
                  <span className="truncate max-w-[150px] font-medium">{label}</span>
                  <span className="font-bold text-[#111827]">
                    {chart.valuePrefix || ''}{val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-2 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2F68FE] to-[#3B82F6] rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Donut / Proportion List
  const totalSum = chart.data.reduce((a, b) => a + b, 0) || 1
  return (
    <div className="mt-2.5 p-3 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-2">
      {chart.title && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1F2937]">
          <TrendingUp className="w-3.5 h-3.5 text-[#2F68FE]" />
          <span>{chart.title}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {chart.labels.map((label, idx) => {
          const val = chart.data[idx] || 0
          const pct = Math.round((val / totalSum) * 100)
          return (
            <div key={idx} className="p-2 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-[11px] font-medium text-[#4B5563] truncate">{label}</div>
              <div className="text-xs font-bold text-[#111827]">
                {chart.valuePrefix || ''}{val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#1D52EB] font-semibold">{pct}% do total</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact Table Renderer
 */
function CompactTableRenderer({ table }: { table: AssistantTableBlock }) {
  return (
    <div className="mt-2.5 rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-xs">
      {table.title && (
        <div className="px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB] text-[11px] font-semibold text-[#1F2937] flex items-center gap-1.5">
          <TableIcon className="w-3.5 h-3.5 text-[#4B5563]" />
          <span>{table.title}</span>
        </div>
      )}
      <div className="overflow-x-auto max-h-48 overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#F3F4F6] text-[#374151] font-semibold border-b border-[#E5E7EB] sticky top-0">
            <tr>
              {table.columns.map((col, idx) => (
                <th key={idx} className="px-3 py-1.5">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {table.rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-[#F9FAFB]">
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`px-3 py-1.5 text-[#1F2937] ${
                      cIdx === row.length - 1 ? 'font-bold text-[#111827]' : 'font-medium'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Summary Card Renderer
 */
function CompactSummaryCardRenderer({ card }: { card: AssistantSummaryCard }) {
  return (
    <div className="mt-2.5 p-3.5 rounded-xl bg-gradient-to-br from-white to-[#F9FAFB] border border-[#E5E7EB] shadow-xs space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] font-semibold text-[#4B5563] uppercase tracking-wider block">
            {card.title}
          </span>
          <div className="text-base font-bold text-[#111827] mt-0.5 tracking-tight">
            {card.mainValue}
          </div>
          {card.subtitle && (
            <p className="text-[11px] font-medium text-[#4B5563] mt-0.5">{card.subtitle}</p>
          )}
        </div>
        {card.badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              card.badge.variant === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : card.badge.variant === 'warning'
                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                : 'bg-blue-50 text-[#1D52EB] border border-blue-300'
            }`}
          >
            {card.badge.label}
          </span>
        )}
      </div>

      {card.metrics && card.metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5E7EB]">
          {card.metrics.map((m, idx) => (
            <div key={idx} className="space-y-0.5">
              <span className="text-[10px] font-medium text-[#6B7280] block">{m.label}</span>
              <span className="text-[11px] font-bold text-[#111827] block">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Export Action Block
 */
function CompactExportRenderer({ exportBlock }: { exportBlock: AssistantExportBlock }) {
  const handleDownload = () => {
    const blob = new Blob([exportBlock.csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', exportBlock.filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="mt-2.5 p-3 rounded-xl bg-white border border-[#E5E7EB] shadow-xs flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h5 className="text-xs font-bold text-[#111827] truncate">{exportBlock.title}</h5>
          <p className="text-[10px] font-medium text-[#4B5563] truncate">{exportBlock.description}</p>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="px-3 py-1.5 rounded-lg bg-[#2F68FE] hover:bg-[#1D52EB] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-xs cursor-pointer"
        style={{ color: '#FFFFFF' }}
      >
        <Download className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} />
        <span>Baixar</span>
      </button>
    </div>
  )
}

export function AssistantFloatingWidget() {
  const { fetchWithAuth } = useTelegramWebApp()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationContext, setConversationContext] = useState<any>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen, loading])

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim()
    if (!text || loading) return

    const now = new Date()
    const timeString = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: timeString,
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) {
      setInputValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }

    setLoading(true)

    try {
      const res = await fetchWithAuth('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: conversationContext }),
      })
      const data = await res.json()

      const structured: AssistantStructuredResponse =
        data?.ok && data?.reply
          ? typeof data.reply === 'string'
            ? { type: 'structured', text: data.reply }
            : data.reply
          : {
              type: 'structured',
              text: data?.error || 'Desculpe, não foi possível obter essa resposta no momento.',
            }

      if (structured?.context) {
        setConversationContext(structured.context)
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: structured.text,
        card: structured.card,
        table: structured.table,
        chart: structured.chart,
        export: structured.export,
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: 'Erro de conexão ao consultar assistente. Por favor, tente novamente.',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  return (
    <>
      {/* Botão Flutuante (Discreto no canto inferior direito) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Abrir Assistente Financeiro"
          aria-label="Abrir Assistente Financeiro"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-3.5 md:right-6 z-30 flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#2F68FE] hover:bg-[#1D52EB] active:scale-95 text-white font-semibold text-xs sm:text-sm rounded-full shadow-lg shadow-blue-500/25 transition-all duration-200 cursor-pointer group hover:shadow-xl hover:shadow-blue-500/30 select-none"
          style={{ color: '#FFFFFF' }}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white fill-white/20" style={{ color: '#FFFFFF' }} />
          </div>
          <span className="font-bold tracking-tight text-white" style={{ color: '#FFFFFF' }}>Assistente</span>
        </button>
      )}

      {/* Painel Flutuante do Assistente (Sheet no Mobile / Popover no Desktop) */}
      {isOpen && (
        <>
          {/* Backdrop no mobile */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 sm:hidden animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="fixed z-50 flex flex-col bg-white border border-[#E5E7EB] shadow-2xl overflow-hidden transition-all duration-200
              inset-x-0 bottom-0 top-[max(2.5rem,env(safe-area-inset-top,0px))] rounded-t-3xl sm:top-auto sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[600px] sm:rounded-2xl
              animate-in slide-in-from-bottom sm:slide-in-from-bottom-5 duration-200
            "
          >
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0 cursor-pointer" onClick={() => setIsOpen(false)}>
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-4 pt-2 sm:pt-3.5 pb-3 bg-white border-b border-[#E5E7EB] select-none shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#2F68FE] flex items-center justify-center text-white shrink-0 shadow-sm shadow-blue-500/20" style={{ color: '#FFFFFF' }}>
                <Sparkles className="w-4 h-4 fill-white/20" style={{ color: '#FFFFFF' }} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[#111827] truncate leading-tight">
                  Assistente financeiro
                </h3>
                <p className="text-[11px] font-medium text-[#4B5563] truncate">
                  Consultas seguras e cálculos determinísticos
                </p>
              </div>
            </div>

            {/* Controles de Janela */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsOpen(false)}
                title="Minimizar"
                aria-label="Minimizar"
                className="p-2 sm:p-1.5 rounded-lg text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Fechar"
                aria-label="Fechar"
                className="p-2 sm:p-1.5 rounded-lg text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Área de Mensagens / Conteúdo com scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9FAFB]">
            {messages.length === 0 ? (
              /* Estado Vazio com Sugestões */
              <div className="h-full flex flex-col justify-center items-center text-center px-1 py-4 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center shadow-inner">
                  <Bot className="w-6 h-6" />
                </div>

                <div className="space-y-1 max-w-xs">
                  <h4 className="text-sm font-bold text-[#111827]">
                    Como posso te ajudar hoje?
                  </h4>
                  <p className="text-xs font-medium text-[#4B5563]">
                    Pergunte sobre gastos, faturas, maiores compras ou exportações.
                  </p>
                </div>

                <div className="w-full space-y-2 pt-1">
                  <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider block text-left px-1">
                    Sugestões rápidas
                  </span>
                  <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {SUGGESTIONS.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(suggestion)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#2F68FE] hover:bg-[#F0F5FF] text-left text-xs text-[#1F2937] hover:text-[#1D52EB] transition-all group shadow-xs cursor-pointer"
                      >
                        <span className="font-semibold text-[#1F2937] group-hover:text-[#1D52EB]">{suggestion}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#6B7280] group-hover:text-[#1D52EB] transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Lista de Mensagens */
              <div className="space-y-3.5">
                {messages.map((msg) => {
                  const isUser = msg.sender === 'user'
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div
                          className="w-7 h-7 rounded-lg bg-[#2F68FE] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs"
                          style={{ color: '#FFFFFF' }}
                        >
                          <Bot className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} />
                        </div>
                      )}

                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                          isUser
                            ? 'bg-[#2F68FE] rounded-br-xs'
                            : 'bg-white border border-[#E5E7EB] text-[#111827] rounded-bl-xs'
                        }`}
                        style={isUser ? { color: '#FFFFFF' } : { color: '#111827' }}
                      >
                        {msg.text && (
                          <p
                            className="whitespace-pre-wrap font-medium"
                            style={isUser ? { color: '#FFFFFF' } : { color: '#111827' }}
                          >
                            {msg.text}
                          </p>
                        )}

                        {/* Rich Blocks (always light surface with dark text) */}
                        {msg.card && <CompactSummaryCardRenderer card={msg.card} />}
                        {msg.chart && <CompactChartRenderer chart={msg.chart} />}
                        {msg.table && <CompactTableRenderer table={msg.table} />}
                        {msg.export && <CompactExportRenderer exportBlock={msg.export} />}

                        <span
                          className={`block text-[10px] font-medium mt-1.5 text-right`}
                          style={isUser ? { color: 'rgba(255, 255, 255, 0.85)' } : { color: '#6B7280' }}
                        >
                          {msg.timestamp}
                        </span>
                      </div>

                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-[#D1D5DB] text-[#1F2937] flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 text-[#1F2937]" />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex gap-2.5 justify-start items-center">
                    <div
                      className="w-7 h-7 rounded-lg bg-[#2F68FE] text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse"
                      style={{ color: '#FFFFFF' }}
                    >
                      <Bot className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} />
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-2xl rounded-bl-xs px-4 py-3 text-xs text-[#1F2937] font-medium flex items-center gap-1.5 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2F68FE] animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2F68FE] animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2F68FE] animate-bounce" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Campo Inferior de Entrada */}
          <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-white border-t border-[#E5E7EB]">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              className="flex items-end gap-2 bg-[#F9FAFB] border border-[#D1D5DB] focus-within:border-[#2F68FE] focus-within:bg-white rounded-xl p-1.5 transition-all"
            >
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder={loading ? 'Consultando finanças…' : 'Pergunte sobre suas finanças…'}
                rows={1}
                className="flex-1 max-h-28 bg-transparent text-xs text-[#111827] placeholder-[#6B7280] resize-none px-2 py-1.5 focus:outline-none leading-relaxed disabled:opacity-50 font-medium"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || loading}
                title="Enviar mensagem"
                aria-label="Enviar mensagem"
                className={`p-2 rounded-lg transition-all shrink-0 cursor-pointer ${
                  inputValue.trim() && !loading
                    ? 'bg-[#2F68FE] hover:bg-[#1D52EB] text-white shadow-xs shadow-blue-500/20'
                    : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
                }`}
                style={inputValue.trim() && !loading ? { color: '#FFFFFF' } : {}}
              >
                <Send className="w-3.5 h-3.5" style={inputValue.trim() && !loading ? { color: '#FFFFFF' } : {}} />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-medium text-[#6B7280]">
                Pressione Enter para enviar, Shift+Enter para quebrar linha
              </span>
            </div>
          </div>
        </div>
        </>
      )}
    </>
  )
}
