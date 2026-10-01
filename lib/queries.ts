/**
 * lib/queries.ts - Facade re-exporting all query functions and types
 * Modularized across domain modules in lib/queries/
 */

// Category queries & helpers
export {
  normalizeCategoryName,
  listCategories,
  createCategory,
  updateCategory,
  translateCategory,
  type CategoryFilter,
} from './queries/categoryQueries'

// Account & Card queries
export {
  isPaymentMethodAccount,
  listAccounts,
  createAccount,
  getAccountDetailsWithStats,
  listAccountsWithStats,
  updateAccount,
  deleteAccount,
  type AccountWithStats,
  type AccountDetailsWithStats,
} from './queries/accountQueries'

// Transaction, Installment & Recurrence mutations/queries
export {
  getEffectiveDate,
  buildEffectiveDateOrFilter,
  listTransactions,
  deleteTransaction,
  deleteInstallmentGroup,
  updateTransaction,
  getTransactionById,
  type TransactionFilter,
  type UpdateTransactionInput,
} from './queries/transactionQueries'

// Dashboard aggregates & financial analytics
export {
  getDashboardSummary,
  type DashboardFilter,
  type AccountMetric,
  type UpcomingCommitment,
  type DashboardSummary,
  type TopCategoryItem,
  type TopIncomeSourceItem,
  type TopVendorItem,
  type DailyExpenseItem,
  type DashboardInsight,
} from './queries/dashboardQueries'

