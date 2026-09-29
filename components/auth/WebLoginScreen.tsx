'use client'

import React, { useState, FormEvent } from 'react'
import { Lock, Sparkles, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'

interface WebLoginScreenProps {
  onLoginSuccess: () => void
}

export function WebLoginScreen({ onLoginSuccess }: WebLoginScreenProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim()) {
      setError('Informe sua senha de acesso.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        onLoginSuccess()
      } else {
        setError(data.error || 'Senha incorreta. Tente novamente.')
      }
    } catch {
      setError('Erro de conexão ao tentar fazer login.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#111827] flex flex-col items-center justify-center p-4 font-sans selection:bg-[#EBF2FF] selection:text-[#2F68FE]">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#2F68FE]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-[#EBEEF2] rounded-3xl p-8 shadow-xl shadow-slate-200/50 relative z-10">
        {/* Brand Icon Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2F68FE] to-[#5487FE] flex items-center justify-center text-white shadow-lg shadow-[#2F68FE]/25 mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Assistente Financeiro
          </h1>
          <p className="text-xs text-[#6B7280] mt-1.5 max-w-xs leading-relaxed">
            Painel financeiro pessoal protegido. Insira sua senha para acessar.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-2.5 text-xs text-red-700 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Senha de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                placeholder="Digite sua senha"
                autoFocus
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#2F68FE] hover:bg-[#1D52EB] active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2F68FE]/25 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Acessar Painel</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-[#F3F4F6] flex items-center justify-center gap-1.5 text-[11px] text-[#9CA3AF]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Sessão segura e criptografada</span>
        </div>
      </div>
    </div>
  )
}
