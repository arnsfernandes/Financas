import type { AccountType } from '@/lib/schema'

export const COLOR_PRESETS = [
  { name: 'Padrão / Automático', hex: '' },
  { name: 'Roxo Nubank', hex: '#820AD1' },
  { name: 'Laranja Inter', hex: '#FF7A00' },
  { name: 'Azul Itaú / Caixa', hex: '#005CA9' },
  { name: 'Vermelho Bradesco', hex: '#CC092F' },
  { name: 'Vermelho Santander', hex: '#EC0000' },
  { name: 'Amarelo BB', hex: '#EAB308' },
  { name: 'Verde PicPay', hex: '#11C76F' },
  { name: 'Azul Mercado Pago', hex: '#009EE3' },
  { name: 'Preto C6 / Carbon', hex: '#1E293B' },
  { name: 'Verde Esmeralda', hex: '#10B981' },
  { name: 'Azul Petróleo', hex: '#0284C7' },
  { name: 'Rosa Magenta', hex: '#E11D48' },
]

export function getAccountTypeBadge(type: AccountType | string) {
  switch (type) {
    case 'credit_card':
      return {
        label: 'Crédito',
        className: 'bg-purple-100/80 text-purple-900 border-purple-300 font-semibold',
      }
    case 'bank_account':
      return {
        label: 'Conta',
        className: 'bg-blue-100/80 text-blue-900 border-blue-300 font-semibold',
      }
    case 'cash':
      return {
        label: 'Dinheiro',
        className: 'bg-emerald-100/80 text-emerald-900 border-emerald-300 font-semibold',
      }
    case 'debit_card':
      return {
        label: 'Débito',
        className: 'bg-indigo-100/80 text-indigo-900 border-indigo-300 font-semibold',
      }
    case 'digital_wallet':
      return {
        label: 'Carteira',
        className: 'bg-cyan-100/80 text-cyan-900 border-cyan-300 font-semibold',
      }
    default:
      return {
        label: 'Outro',
        className: 'bg-slate-100 text-slate-800 border-slate-300 font-semibold',
      }
  }
}
