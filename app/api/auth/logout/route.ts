import { NextResponse } from 'next/server'
import { clearWebSessionCookie } from '@/lib/webAuth'

export async function POST() {
  const response = NextResponse.json({
    ok: true,
    message: 'Logout realizado com sucesso.',
  })
  clearWebSessionCookie(response)
  return response
}
