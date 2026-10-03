import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient, usernameToEmail } from '@/lib/supabaseAuth'
import { createWebSessionToken, attachWebSessionCookie, verifyWebPassword } from '@/lib/webAuth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { username, password } = body

    const trimmedUsername = typeof username === 'string' ? username.trim() : ''
    const trimmedPassword = typeof password === 'string' ? password : ''

    if (!trimmedUsername && !trimmedPassword) {
      return NextResponse.json(
        { ok: false, error: 'Por favor, informe o usuário e a senha.' },
        { status: 400 }
      )
    }

    // 1. Check if user is trying legacy master password login (only password provided, no username)
    if (!trimmedUsername && trimmedPassword) {
      if (process.env.WEB_ACCESS_PASSWORD && verifyWebPassword(trimmedPassword)) {
        const sessionSecret = process.env.WEB_SESSION_SECRET || 'financas-session-secret-fallback'
        const token = createWebSessionToken(undefined, sessionSecret, {
          username: 'admin',
          name: 'Administrador',
        })
        const response = NextResponse.json({
          ok: true,
          message: 'Login realizado com sucesso.',
          user: { username: 'admin', name: 'Administrador' },
        })
        attachWebSessionCookie(response, token)
        return response
      }
      return NextResponse.json(
        { ok: false, error: 'Senha incorreta.' },
        { status: 401 }
      )
    }

    if (!trimmedUsername) {
      return NextResponse.json(
        { ok: false, error: 'Informe seu nome de usuário.' },
        { status: 400 }
      )
    }

    if (!trimmedPassword) {
      return NextResponse.json(
        { ok: false, error: 'Informe sua senha.' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { ok: false, error: 'Serviço de autenticação não configurado no servidor.' },
        { status: 500 }
      )
    }

    const email = usernameToEmail(trimmedUsername)
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    // 2. Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: trimmedPassword,
    })

    if (authError) {
      return NextResponse.json(
        { ok: false, error: 'Usuário ou senha incorretos.' },
        { status: 401 }
      )
    }

    const user = authData.user
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Falha ao autenticar usuário.' },
        { status: 401 }
      )
    }

    // 3. Retrieve user profile (name and username)
    const adminSupabase = getSupabaseServerClient()
    let profileName = user.user_metadata?.name || trimmedUsername
    let profileUsername = user.user_metadata?.username || trimmedUsername

    if (adminSupabase) {
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('name, username')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        profileName = profile.name || profileName
        profileUsername = profile.username || profileUsername
      }
    }

    // 4. Create Web Session and attach cookie
    const sessionSecret = process.env.WEB_SESSION_SECRET || 'financas-session-secret-fallback'
    const token = createWebSessionToken(undefined, sessionSecret, {
      userId: user.id,
      username: profileUsername,
      name: profileName,
    })

    const response = NextResponse.json({
      ok: true,
      message: 'Login realizado com sucesso.',
      user: {
        id: user.id,
        username: profileUsername,
        name: profileName,
      },
    })

    attachWebSessionCookie(response, token)
    return response
  } catch (error: any) {
    console.error('[Login] Erro inesperado:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro interno ao processar login.' },
      { status: 500 }
    )
  }
}
