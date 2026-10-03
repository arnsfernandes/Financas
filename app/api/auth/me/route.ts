import { NextRequest, NextResponse } from 'next/server'
import { verifyWebSessionFromRequest } from '@/lib/webAuth'

export async function GET(req: NextRequest) {
  const result = verifyWebSessionFromRequest(req)
  if (result.valid && result.payload) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      authType: 'web',
      user: {
        id: result.payload.userId || null,
        username: result.payload.username || null,
        name: result.payload.name || null,
      },
    })
  }

  return NextResponse.json({
    ok: false,
    authenticated: false,
    error: result.error || 'Não autenticado',
  })
}
