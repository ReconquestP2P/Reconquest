/**
 * TxType Constants — Single Source of Truth
 * 
 * All transaction type names used across the platform MUST come from here.
 * This prevents type mismatches between template creation, signing ceremony,
 * dispute resolution, and collateral release.
 * 
 * TWO naming conventions exist:
 *   - DISPLAY names: Used in API responses and frontend UI (e.g. DEFAULT_LIQUIDATION)
 *   - STORAGE names: Used in the database pre_signed_transactions table (e.g. default)
 * 
 * This module handles all conversions between them.
 */

export const STORAGE_TX_TYPES = {
  REPAYMENT: 'repayment',
  DEFAULT: 'default',
  LIQUIDATION: 'liquidation',
  RECOVERY: 'recovery',
} as const;

export type StorageTxType = typeof STORAGE_TX_TYPES[keyof typeof STORAGE_TX_TYPES];

export const ALL_STORAGE_TX_TYPES: StorageTxType[] = [
  STORAGE_TX_TYPES.REPAYMENT,
  STORAGE_TX_TYPES.DEFAULT,
  STORAGE_TX_TYPES.LIQUIDATION,
  STORAGE_TX_TYPES.RECOVERY,
];

export const DISPLAY_TX_TYPES = {
  REPAYMENT: 'REPAYMENT',
  DEFAULT_LIQUIDATION: 'DEFAULT_LIQUIDATION',
  BORROWER_RECOVERY: 'BORROWER_RECOVERY',
  LIQUIDATION: 'LIQUIDATION',
} as const;

const DISPLAY_TO_STORAGE: Record<string, StorageTxType> = {
  'REPAYMENT': STORAGE_TX_TYPES.REPAYMENT,
  'DEFAULT_LIQUIDATION': STORAGE_TX_TYPES.DEFAULT,
  'DEFAULT': STORAGE_TX_TYPES.DEFAULT,
  'BORROWER_RECOVERY': STORAGE_TX_TYPES.RECOVERY,
  'RECOVERY': STORAGE_TX_TYPES.RECOVERY,
  'LIQUIDATION': STORAGE_TX_TYPES.LIQUIDATION,
  'FULL_LIQUIDATION': STORAGE_TX_TYPES.LIQUIDATION,
  'repayment': STORAGE_TX_TYPES.REPAYMENT,
  'default_liquidation': STORAGE_TX_TYPES.DEFAULT,
  'default': STORAGE_TX_TYPES.DEFAULT,
  'borrower_recovery': STORAGE_TX_TYPES.RECOVERY,
  'recovery': STORAGE_TX_TYPES.RECOVERY,
  'liquidation': STORAGE_TX_TYPES.LIQUIDATION,
};

const DECISION_TO_STORAGE: Record<string, StorageTxType> = {
  'BORROWER_NOT_DEFAULTED': STORAGE_TX_TYPES.REPAYMENT,
  'BORROWER_DEFAULTED': STORAGE_TX_TYPES.DEFAULT,
  'TIMEOUT_DEFAULT': STORAGE_TX_TYPES.LIQUIDATION,
};

export function normalizeToStorageType(displayType: string): StorageTxType {
  const mapped = DISPLAY_TO_STORAGE[displayType];
  if (mapped) return mapped;

  const upper = displayType.toUpperCase();
  const mappedUpper = DISPLAY_TO_STORAGE[upper];
  if (mappedUpper) return mappedUpper;

  const lower = displayType.toLowerCase();
  const mappedLower = DISPLAY_TO_STORAGE[lower];
  if (mappedLower) return mappedLower;

  throw new Error(
    `SECURITY: Unknown transaction type "${displayType}". ` +
    `Valid types: ${Object.keys(DISPLAY_TO_STORAGE).join(', ')}`
  );
}

export function decisionToStorageType(decision: string): StorageTxType {
  const mapped = DECISION_TO_STORAGE[decision];
  if (!mapped) {
    throw new Error(
      `SECURITY: Unknown resolution decision "${decision}". ` +
      `Valid decisions: ${Object.keys(DECISION_TO_STORAGE).join(', ')}`
    );
  }
  return mapped;
}

export function isValidStorageType(type: string): type is StorageTxType {
  return ALL_STORAGE_TX_TYPES.includes(type as StorageTxType);
}
