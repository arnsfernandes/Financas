'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import { Lock, User, Sparkles, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

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

    const cleanName = name.trim()
    const cleanUser = username.trim()

    if (!cleanName) {
      setError('Por favor, informe seu nome.')
      return
    }

    if (!cleanUser) {
      setError('Por favor, informe um nome de usuário.')
      return
    }

    if (cleanUser.length < 3) {
      setError('O nome de usuário deve ter pelo menos 3 caracteres.')
      return
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(cleanUser)) {
      setError('O usuário só pode conter letras, números, ponto, hífen ou underline.')
      return
    }

    if (!password) {
      setError('Por favor, crie uma senha.')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas digitadas não coincidem.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          username: cleanUser,
          password,
          confirmPassword,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setSuccess(true)
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 1000)
      } else {
        setError(data.error || 'Erro ao realizar cadastro. Tente novamente.')
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
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2F68FE] to-[#5487FE] flex items-center justify-center text-white shadow-lg shadow-[#2F68FE]/25 mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Criar Conta no Finanças
          </h1>
          <p className="text-xs text-[#6B7280] mt-1.5 max-w-xs leading-relaxed">
            Cadastre-se rapidamente sem complicação e sem necessidade de e-mail.
          </p>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-2.5 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold">Conta criada com sucesso!</p>
              <p className="text-emerald-700">Entrando no painel...</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-2.5 text-xs text-red-700 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Nome Completo
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                <UserCheck className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError('')
                }}
                placeholder="Ex: Arnaldo Fernandes"
                autoFocus
                disabled={loading || success}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Nome de Usuário
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase())
                  if (error) setError('')
                }}
                placeholder="Ex: arnaldo"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={loading || success}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
            <p className="text-[10px] text-[#9CA3AF] mt-1 pl-1">
              Letras, números, ponto ou traço (sem espaços).
            </p>
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
                placeholder="Mínimo 6 caracteres"
                disabled={loading || success}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Confirmar Senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (error) setError('')
                }}
                placeholder="Repita sua senha"
                disabled={loading || success}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#2F68FE] focus:bg-white focus:ring-4 focus:ring-[#2F68FE]/10 rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success || !name.trim() || !username.trim() || !password || !confirmPassword}
            className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-[#2F68FE] hover:bg-[#1D52EB] active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2F68FE]/25 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Criar Conta</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link to Login */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[#6B7280]">
            Já possui uma conta?{' '}
            <Link
              href="/login"
              className="font-semibold text-[#2F68FE] hover:underline"
            >
              Fazer login
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
