import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient, usernameToEmail, validateUsername } from '@/lib/supabaseAuth'
import { createWebSessionToken, attachWebSessionCookie } from '@/lib/webAuth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { name, username, password, confirmPassword } = body

    // 1. Validation of inputs
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const trimmedUsername = typeof username === 'string' ? username.trim() : ''
    const trimmedPassword = typeof password === 'string' ? password : ''
    const trimmedConfirm = typeof confirmPassword === 'string' ? confirmPassword : ''

    if (!trimmedName) {
      return NextResponse.json(
        { ok: false, error: 'Por favor, informe seu nome completo.' },
        { status: 400 }
      )
    }

    const usernameCheck = validateUsername(trimmedUsername)
    if (!usernameCheck.valid) {
      return NextResponse.json(
        { ok: false, error: usernameCheck.error || 'Nome de usuário inválido.' },
        { status: 400 }
      )
    }

    if (!trimmedPassword || trimmedPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'A senha deve conter no mínimo 6 caracteres.' },
        { status: 400 }
      )
    }

    if (trimmedPassword !== trimmedConfirm) {
      return NextResponse.json(
        { ok: false, error: 'A confirmação de senha não confere.' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || (!serviceKey && !anonKey)) {
      return NextResponse.json(
        { ok: false, error: 'Serviço de autenticação não configurado no servidor.' },
        { status: 500 }
      )
    }

    const email = usernameToEmail(trimmedUsername)
    const adminSupabase = getSupabaseServerClient()

    // 2. Pre-check if username already exists in profiles
    if (adminSupabase) {
      const { data: existingProfile } = await adminSupabase
        .from('profiles')
        .select('id, username')
        .ilike('username', trimmedUsername)
        .maybeSingle()

      if (existingProfile) {
        return NextResponse.json(
          { ok: false, error: 'Este nome de usuário já está em uso. Escolha outro.' },
          { status: 409 }
        )
      }
    }

    // 3. Create user in Supabase Auth
    // Use admin.createUser if service role key is available (auto confirms email without verification requirement)
    let authUser: { id: string; email?: string } | null = null

    if (adminSupabase && serviceKey) {
      const { data: createData, error: createError } = await adminSupabase.auth.admin.createUser({
        email,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: {
          name: trimmedName,
          username: trimmedUsername.toLowerCase(),
        },
      })

      if (createError) {
        if (
          createError.message?.toLowerCase().includes('already registered') ||
          createError.message?.toLowerCase().includes('duplicate') ||
          createError.status === 422
        ) {
          return NextResponse.json(
            { ok: false, error: 'Este nome de usuário já está em uso.' },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { ok: false, error: `Erro ao criar usuário: ${createError.message}` },
          { status: 400 }
        )
      }

      authUser = createData.user
    } else {
      // Fallback to signUp with anon key
      const client = createClient(supabaseUrl, anonKey || '')
      const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email,
        password: trimmedPassword,
        options: {
          data: {
            name: trimmedName,
            username: trimmedUsername.toLowerCase(),
          },
        },
      })

      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes('already registered')) {
          return NextResponse.json(
            { ok: false, error: 'Este nome de usuário já está em uso.' },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { ok: false, error: signUpError.message || 'Falha no cadastro.' },
          { status: 400 }
        )
      }

      authUser = signUpData.user
    }

    if (!authUser || !authUser.id) {
      return NextResponse.json(
        { ok: false, error: 'Não foi possível concluir o cadastro do usuário.' },
        { status: 500 }
      )
    }

    // 4. Create profile record in profiles table
    if (adminSupabase) {
      const { error: profileError } = await adminSupabase.from('profiles').upsert(
        {
          id: authUser.id,
          username: trimmedUsername.toLowerCase(),
          name: trimmedName,
        },
        { onConflict: 'id' }
      )

      if (profileError) {
        console.error('[Signup] Erro ao criar perfil do usuário:', profileError)
      }
    }

    // 5. Create web session token and attach cookie for immediate login
    const sessionSecret = process.env.WEB_SESSION_SECRET || 'financas-session-secret-fallback'
    const token = createWebSessionToken(undefined, sessionSecret, {
      userId: authUser.id,
      username: trimmedUsername.toLowerCase(),
      name: trimmedName,
    })

    const response = NextResponse.json({
      ok: true,
      message: 'Cadastro realizado com sucesso!',
      user: {
        id: authUser.id,
        username: trimmedUsername.toLowerCase(),
        name: trimmedName,
      },
    })

    attachWebSessionCookie(response, token)
    return response
  } catch (error: any) {
    console.error('[Signup] Erro inesperado:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro interno ao processar cadastro.' },
      { status: 500 }
    )
  }
}
