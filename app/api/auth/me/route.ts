import { NextRequest, NextResponse } from 'next/server'
import { verifyWebSessionFromRequest } from '@/lib/webAuth'

export async function GET(req: NextRequest) {
  const result = verifyWebSessionFromRequest(req)
  if (result.valid) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      authType: 'web',
    })
  }

  return NextResponse.json({
    ok: false,
    authenticated: false,
    error: result.error || 'Não autenticado',
  })
}
