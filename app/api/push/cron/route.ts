import { NextRequest, NextResponse } from 'next/server'
import { processAutomaticPushReminders } from '@/lib/webPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint for automated cron trigger to dispatch due invoice & recurrence push notifications.
 *
 * Security:
 * - Accepts Vercel Cron requests (Authorization header: Bearer CRON_SECRET or x-vercel-cron)
 * - Also callable securely via system maintenance secret
 */
export async function GET(req: NextRequest) {
  return handleCronTrigger(req)
}

export async function POST(req: NextRequest) {
  return handleCronTrigger(req)
}

async function handleCronTrigger(req: NextRequest) {
  // Validate trigger authorization
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.WEB_ACCESS_PASSWORD
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'

  let authorized = false

  if (isVercelCron) {
    authorized = true
  } else if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true
  } else if (process.env.NODE_ENV !== 'production') {
    // In local development, permit testing
    authorized = true
  }

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const result = await processAutomaticPushReminders()
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (error) {
    console.error('Error in /api/push/cron:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Falha ao processar notificações push.' },
      { status: 500 }
    )
  }
}
