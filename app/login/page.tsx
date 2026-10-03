'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import { Lock, User, Sparkles, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState('')

  // If already authenticated, redirect immediately to home
  useEffect(() => {
    async function checkExistingAuth() {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.ok && data.authenticated) {
          router.replace('/')
          return
        }
      } catch {
        // Not authenticated
      } finally {
        setCheckingAuth(false)
      }
    }
    checkExistingAuth()
  }, [router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const cleanUser = username.trim()
    if (!cleanUser) {
      setError('Por favor, informe seu usuário.')
      return
    }
    if (!password) {
      setError('Por favor, informe sua senha.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        // Redireciona para o painel principal
        router.push('/')
        router.refresh()
      } else {
        setError(data.error || 'Usuário ou senha incorretos.')
      }
    } catch {
      setError('Erro de conexão com o servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#2F68FE]/30 border-t-[#2F68FE] rounded-full animate-spin" />
      </div>
    )
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
            Entrar no Finanças
          </h1>
          <p className="text-xs text-[#6B7280] mt-1.5 max-w-xs leading-relaxed">
            Acesse seu painel financeiro com seu usuário e senha.
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
              Usuário
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) setError('')
                }}
                placeholder="Ex: arnaldo"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Senha
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
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
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

        {/* Link to Register */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[#6B7280]">
            Ainda não tem uma conta?{' '}
            <Link
              href="/cadastro"
              className="font-semibold text-[#2F68FE] hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div className="mt-6 pt-6 border-t border-[#F3F4F6] flex items-center justify-center gap-1.5 text-[11px] text-[#9CA3AF]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Sessão segura e criptografada</span>
        </div>
      </div>
    </div>
  )
}
