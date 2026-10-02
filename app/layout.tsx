import './globals.css'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { TelegramWebAppProvider } from '@/lib/useTelegramWebApp'

export const metadata: Metadata = {
  title: 'Finanças',
  description: 'Controle Financeiro Inteligente com IA, extrato e gestão de contas',
  applicationName: 'Finanças',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Finanças',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#F8F9FA',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="bg-[#F8F9FA] text-[#111827]">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Finanças" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F8F9FA" />
      </head>
      <body className="min-h-screen bg-[#F8F9FA] antialiased selection:bg-[#EBF2FF] selection:text-[#2F68FE]">
        <TelegramWebAppProvider>{children}</TelegramWebAppProvider>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').catch(function(err) {
                  console.debug('ServiceWorker registration omitted:', err);
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  )
}


