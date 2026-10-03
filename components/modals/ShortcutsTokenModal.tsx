'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Smartphone,
  Key,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Mic,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react'

export interface ShortcutsTokenModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ShortcutsTokenModal({ isOpen, onClose }: ShortcutsTokenModalProps) {
  const [token, setToken] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'token' | 'guide'>('token')

  useEffect(() => {
    if (isOpen) {
      fetchTokenStatus()
    }
  }, [isOpen])

  async function fetchTokenStatus() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/shortcuts/token')
      const data = await res.json()
      if (data.ok) {
        setToken(data.token)
        setCreatedAt(data.createdAt)
      } else {
        setError(data.error || 'Erro ao carregar status do token.')
      }
    } catch {
      setError('Erro de conexão ao carregar status do token.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateToken() {
    if (token && !confirm('Gerar um novo token irá revogar o token anterior imediatamente. Deseja continuar?')) {
      return
    }

    setActionLoading(true)
    setError('')
    try {
      const res = await fetch('/api/shortcuts/token', { method: 'POST' })
      const data = await res.json()
      if (data.ok && data.token) {
        setToken(data.token)
        setCreatedAt(data.createdAt)
      } else {
        setError(data.error || 'Erro ao gerar token.')
      }
    } catch {
      setError('Erro de conexão ao gerar token.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRevokeToken() {
    if (!confirm('Deseja realmente revogar seu token de Atalhos? Seus atalhos no iPhone deixarão de funcionar até gerar um novo token.')) {
      return
    }

    setActionLoading(true)
    setError('')
    try {
      const res = await fetch('/api/shortcuts/token', { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setToken(null)
        setCreatedAt(null)
      } else {
        setError(data.error || 'Erro ao revogar token.')
      }
    } catch {
      setError('Erro de conexão ao revogar token.')
    } finally {
      setActionLoading(false)
    }
  }

  function handleCopy() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2F68FE] to-[#5487FE] flex items-center justify-center text-white shadow-md shadow-[#2F68FE]/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Atalhos & Siri do iPhone</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#EBF2FF] text-[#2F68FE]">
                  Voz
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Crie lançamentos financeiros falando com a Siri
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('token')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'token'
                ? 'border-[#2F68FE] text-[#2F68FE]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Token de Acesso
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'border-[#2F68FE] text-[#2F68FE]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Passo a Passo no iPhone
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {activeTab === 'token' ? (
            <div className="space-y-5">
              {/* Explicação breve */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/70 text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Key className="w-4 h-4 text-[#2F68FE]" />
                  <span>Autenticação Bearer para o app Atalhos</span>
                </div>
                <p className="leading-relaxed">
                  Este token identifica com segurança a sua conta ao enviar comandos por voz pela Siri ou pelo app Atalhos do iOS. Guarde-o em segurança.
                </p>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Verificando credenciais...
                </div>
              ) : token ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Seu Token Bearer
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs text-slate-800 break-all select-all">
                        {token}
                      </div>
                      <button
                        onClick={handleCopy}
                        className={`p-3 rounded-2xl font-medium text-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                          copied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#2F68FE] hover:bg-[#1D52EB] text-white shadow-xs'
                        }`}
                        title="Copiar Token"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                    {createdAt && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Gerado em: {new Date(createdAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>

                  {/* Ações de gerenciamento */}
                  <div className="pt-3 flex flex-wrap gap-2.5">
                    <button
                      onClick={handleGenerateToken}
                      disabled={actionLoading}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                      <span>Gerar Novo Token</span>
                    </button>

                    <button
                      onClick={handleRevokeToken}
                      disabled={actionLoading}
                      className="px-4 py-2.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revogar Token</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">Nenhum token ativo</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                      Gere seu primeiro token seguro para conectar o app Atalhos da Apple ao Finanças.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateToken}
                    disabled={actionLoading}
                    className="py-3 px-6 rounded-2xl bg-[#2F68FE] hover:bg-[#1D52EB] text-white font-semibold text-xs inline-flex items-center gap-2 shadow-lg shadow-[#2F68FE]/20 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{actionLoading ? 'Gerando...' : 'Gerar Token de Acesso'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-900 font-medium flex items-center gap-2">
                <Mic className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Exemplo de comando de voz: <i>&quot;Gastei 45 de gasolina no Inter&quot;</i></span>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
                  <span className="font-bold text-slate-900 block">1. Criar Atalho no iPhone</span>
                  <p className="text-slate-600">
                    Abra o app <b>Atalhos (Shortcuts)</b> no iOS, toque no <b>+</b> e nomeie como <b>&quot;Novo Gasto&quot;</b> ou <b>&quot;Finanças&quot;</b>.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
                  <span className="font-bold text-slate-900 block">2. Ação: Pedir Entrada</span>
                  <p className="text-slate-600">
                    Adicione a ação <b>&quot;Pedir Entrada&quot;</b> (Tipo: <b>Texto</b>, Mensagem: <i>&quot;O que você gastou?&quot;</i>).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <span className="font-bold text-slate-900 block">3. Ação: Obter Conteúdo da URL</span>
                  <p className="text-slate-600">Adicione a ação <b>&quot;Obter Conteúdo da URL&quot;</b> com os seguintes dados:</p>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1 font-mono text-[11px]">
                    <div><b>URL:</b> <code>https://seu-dominio/api/shortcuts/transaction</code></div>
                    <div><b>Método:</b> <code>POST</code></div>
                    <div><b>Cabeçalhos:</b></div>
                    <div className="pl-2">• <code>Authorization</code>: <code>Bearer {token ? `${token.slice(0, 12)}...` : '<seu_token>'}</code></div>
                    <div className="pl-2">• <code>Content-Type</code>: <code>application/json</code></div>
                    <div><b>Corpo da Solicitação (JSON):</b></div>
                    <div className="pl-2">• <code>text</code>: <b>Entrada Fornecida</b></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
                  <span className="font-bold text-slate-900 block">4. Resposta Falada da Siri</span>
                  <p className="text-slate-600">
                    Adicione a ação <b>&quot;Obter Valor do Dicionário&quot;</b> para a chave <code>message</code> e conecte à ação <b>&quot;Falar Texto&quot;</b> ou <b>&quot;Mostrar Notificação&quot;</b>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tokens criptograficamente protegidos</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
