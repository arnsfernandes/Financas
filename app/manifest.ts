import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finanças',
    short_name: 'Finanças',
    description: 'Controle Financeiro Inteligente com IA, extrato e gestão de contas',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay'],
    orientation: 'portrait',
    background_color: '#F8F9FA',
    theme_color: '#F8F9FA',
    categories: ['finance', 'productivity', 'utilities'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Novo Lançamento',
        short_name: 'Novo',
        description: 'Adicionar nova receita ou despesa',
        url: '/?tab=new',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Extrato',
        short_name: 'Extrato',
        description: 'Ver transações e extrato financeiro',
        url: '/?tab=transactions',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Visão Geral',
        short_name: 'Visão Geral',
        description: 'Painel e resumo do mês',
        url: '/?tab=dashboard',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Contas e Cartões',
        short_name: 'Contas',
        description: 'Saldos, contas e faturas de cartões',
        url: '/?tab=accounts',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}

