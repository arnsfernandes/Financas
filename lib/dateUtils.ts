/**
 * Utility functions for installment dates and calendar arithmetic.
 */

/**
 * Adds a given number of months to a base date (YYYY-MM-DD or ISO string),
 * preserving the day-of-month or clamping to the last valid day of that target month.
 *
 * Example:
 * addMonthsToDate('2026-01-31', 1) -> '2026-02-28' (non-leap year)
 * addMonthsToDate('2026-09-23', 3) -> '2026-12-23'
 * addMonthsToDate('2026-11-15', 3) -> '2027-02-15'
 */
export function addMonthsToDate(baseDateStr: string, monthsToAdd: number): string {
  // Extract YYYY, MM, DD safely
  const dateMatch = baseDateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  let year: number
  let month: number // 1-12
  let day: number

  if (dateMatch) {
    year = parseInt(dateMatch[1], 10)
    month = parseInt(dateMatch[2], 10)
    day = parseInt(dateMatch[3], 10)
  } else {
    const d = new Date(baseDateStr)
    if (isNaN(d.getTime())) {
      const now = new Date()
      year = now.getUTCFullYear()
      month = now.getUTCMonth() + 1
      day = now.getUTCDate()
    } else {
      year = d.getUTCFullYear()
      month = d.getUTCMonth() + 1
      day = d.getUTCDate()
    }
  }

  // Calculate target year and target month (0-indexed month arithmetic)
  const totalMonths = (year * 12 + (month - 1)) + monthsToAdd
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth0 = totalMonths % 12 // 0 to 11
  const targetMonth = targetMonth0 + 1 // 1 to 12

  // Find maximum days in target month
  // Day 0 of next month gives the last day of targetMonth
  const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const clampedDay = Math.min(day, maxDaysInTargetMonth)

  const yStr = String(targetYear).padStart(4, '0')
  const mStr = String(targetMonth).padStart(2, '0')
  const dStr = String(clampedDay).padStart(2, '0')

  return `${yStr}-${mStr}-${dStr}`
}

/**
 * Calculates the next recurrence date based on the current date and frequency.
 * Default is monthly.
 */
export function computeNextRecurrenceDate(
  currentDateStr: string,
  frequency: 'monthly' | 'weekly' | 'yearly' | string = 'monthly'
): string {
  if (frequency === 'weekly') {
    const d = new Date(currentDateStr.slice(0, 10) + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 7)
    return d.toISOString().slice(0, 10)
  }
  if (frequency === 'yearly') {
    return addMonthsToDate(currentDateStr, 12)
  }
  // Default: monthly
  return addMonthsToDate(currentDateStr, 1)
}
/**
 * Helper to extract effective date string (YYYY-MM-DD) from a transaction
 */
export function getEffectiveDate(tx: { date?: string | null; created_at?: string | null }): string {
  if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    return tx.date
  }
  if (tx.created_at) {
    return tx.created_at.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}
