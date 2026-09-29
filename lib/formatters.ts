import {
  Landmark,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
} from 'lucide-react'

export function formatBRL(value?: number | null): string {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function getAccountTypeLabel(type?: string | null): string {
  switch (type) {
    case 'bank_account':
      return 'Conta Bancária'
    case 'cash':
      return 'Dinheiro'
    case 'credit_card':
      return 'Cartão de Crédito'
    case 'debit_card':
      return 'Cartão de Débito'
    case 'digital_wallet':
      return 'Carteira Digital'
    case 'other':
      return 'Outros'
    default:
      return type || 'Conta'
  }
}

export function getAccountTypeLucideIcon(type?: string | null) {
  switch (type) {
    case 'bank_account':
      return Landmark
    case 'cash':
      return Banknote
    case 'credit_card':
    case 'debit_card':
      return CreditCard
    case 'digital_wallet':
      return Smartphone
    case 'other':
    default:
      return Wallet
  }
}

export function getAccountTypeIcon(type?: string | null): string {
  switch (type) {
    case 'bank_account':
      return '🏦'
    case 'cash':
      return '💵'
    case 'credit_card':
      return '💳'
    case 'debit_card':
      return '🏧'
    case 'digital_wallet':
      return '📱'
    case 'other':
      return '📦'
    default:
      return '💳'
  }
}
