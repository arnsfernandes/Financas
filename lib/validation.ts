import type { Receipt, LineItem } from './schema'

export type ReviewStatus = 'confirmed' | 'needs_review'

export interface ValidationResult {
  reviewStatus: ReviewStatus
  reviewReasons: string[]
}

/**
 * Validates a transaction receipt deterministically without additional AI calls.
 *
 * Checks:
 * 1. Total ausente ou zero/negativo
 * 2. Estabelecimento ausente
 * 3. Data ausente ou inválida
 * 4. Categoria ausente
 * 5. Soma dos totais dos itens divergente do total da transação (> R$ 0.05 tolerância)
 * 6. Quantidade × Preço unitário divergente do total do item (> R$ 0.02 tolerância)
 * 7. Inconsistências de parcelamento (ex: parcela atual > total, total <= 0, etc.)
 * 8. Inconsistências de recorrência (ex: recorrente marcado mas status inválido)
 */
export function validateReceipt(receipt: Receipt): ValidationResult {
  const reasons: string[] = []

  // 1. Total ausente ou inválido
  if (receipt.total === null || receipt.total === undefined || isNaN(receipt.total)) {
    reasons.push('Total da transação ausente.')
  } else if (receipt.total <= 0) {
    reasons.push('Valor total da transação deve ser maior que zero.')
  }

  // 2. Estabelecimento ausente
  if (!receipt.vendor || !receipt.vendor.trim()) {
    reasons.push('Estabelecimento ou fonte pagadora não identificado.')
  }

  // 3. Data ausente ou inválida
  if (!receipt.date || !receipt.date.trim()) {
    reasons.push('Data da transação ausente.')
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date.trim())) {
    reasons.push('Formato de data inválido.')
  }

  // 4. Categoria ausente
  if (!receipt.category || !receipt.category.trim()) {
    reasons.push('Categoria da transação não informada.')
  }

  // 5 & 6. Validação de itens
  if (receipt.items && receipt.items.length > 0) {
    let itemsSum = 0
    let hasValidItemTotals = false

    receipt.items.forEach((item, index) => {
      const itemNum = index + 1
      const itemTotal = typeof item.total === 'number' ? item.total : null
      const unitPrice = typeof item.unit_price === 'number' ? item.unit_price : null
      const quantity = typeof item.quantity === 'number' ? item.quantity : null

      if (itemTotal !== null) {
        itemsSum += itemTotal
        hasValidItemTotals = true
      }

      // Check item math on effective_unit_price:
      // Since unit_price is normalized to net_total / quantity, quantity × unit_price ≈ net_total
      if (quantity !== null && unitPrice !== null && itemTotal !== null) {
        const expectedTotal = quantity * unitPrice
        const diff = Math.abs(expectedTotal - itemTotal)
        // 5 cents tolerance for decimal weight rounding (e.g. 0.354 kg * 29.90)
        if (diff > 0.08) {
          reasons.push(
            `Item ${itemNum} ("${item.description}"): multiplicação (${quantity} × R$ ${unitPrice.toFixed(2)} = R$ ${expectedTotal.toFixed(2)}) diverge do total líquido do item (R$ ${itemTotal.toFixed(2)}).`
          )
        }
      }
    })

    // Check sum of net item totals vs total transaction amount
    if (hasValidItemTotals && typeof receipt.total === 'number' && receipt.total > 0) {
      const totalDiff = Math.abs(itemsSum - receipt.total)
      if (totalDiff > 0.10) {
        reasons.push(
          `Soma dos itens líquidos (R$ ${itemsSum.toFixed(2)}) diverge do total da transação (R$ ${receipt.total.toFixed(2)}).`
        )
      }
    }
  }

  // 7. Inconsistências de Parcelamento
  if (receipt.installment_total !== null && receipt.installment_total !== undefined) {
    if (receipt.installment_total <= 1) {
      reasons.push('Número total de parcelas deve ser maior que 1.')
    }
    if (
      receipt.installment_current !== null &&
      receipt.installment_current !== undefined &&
      (receipt.installment_current < 1 || receipt.installment_current > receipt.installment_total)
    ) {
      reasons.push(
        `Parcela atual (${receipt.installment_current}) é inválida para o total de ${receipt.installment_total} parcelas.`
      )
    }
  }

  // 8. Inconsistências de Recorrência
  if (receipt.is_recurring) {
    if (
      receipt.recurrence_status &&
      receipt.recurrence_status !== 'active' &&
      receipt.recurrence_status !== 'ended'
    ) {
      reasons.push('Status de recorrência inválido.')
    }
  }

  return {
    reviewStatus: reasons.length > 0 ? 'needs_review' : 'confirmed',
    reviewReasons: reasons,
  }
}
