import {
  STORAGE_TX_TYPES,
  ALL_STORAGE_TX_TYPES,
  DISPLAY_TX_TYPES,
  normalizeToStorageType,
  decisionToStorageType,
  isValidStorageType,
} from '../txTypes';

describe('TxType Constants - Single Source of Truth', () => {
  describe('STORAGE_TX_TYPES', () => {
    it('defines exactly 4 canonical storage types', () => {
      expect(ALL_STORAGE_TX_TYPES).toEqual(['repayment', 'default', 'liquidation', 'recovery']);
    });

    it('all values are lowercase strings', () => {
      for (const val of Object.values(STORAGE_TX_TYPES)) {
        expect(val).toBe(val.toLowerCase());
      }
    });
  });

  describe('normalizeToStorageType', () => {
    it('maps UPPERCASE display names to lowercase storage types', () => {
      expect(normalizeToStorageType('REPAYMENT')).toBe('repayment');
      expect(normalizeToStorageType('DEFAULT_LIQUIDATION')).toBe('default');
      expect(normalizeToStorageType('BORROWER_RECOVERY')).toBe('recovery');
      expect(normalizeToStorageType('LIQUIDATION')).toBe('liquidation');
    });

    it('maps lowercase display names to storage types', () => {
      expect(normalizeToStorageType('repayment')).toBe('repayment');
      expect(normalizeToStorageType('default_liquidation')).toBe('default');
      expect(normalizeToStorageType('borrower_recovery')).toBe('recovery');
      expect(normalizeToStorageType('liquidation')).toBe('liquidation');
    });

    it('passes through already-normalized storage types unchanged', () => {
      expect(normalizeToStorageType('repayment')).toBe('repayment');
      expect(normalizeToStorageType('default')).toBe('default');
      expect(normalizeToStorageType('liquidation')).toBe('liquidation');
      expect(normalizeToStorageType('recovery')).toBe('recovery');
    });

    it('handles mixed case', () => {
      expect(normalizeToStorageType('Default_Liquidation')).toBe('default');
      expect(normalizeToStorageType('Borrower_Recovery')).toBe('recovery');
    });

    it('throws on unknown type names (prevents silent bugs)', () => {
      expect(() => normalizeToStorageType('UNKNOWN_TYPE')).toThrow('SECURITY: Unknown transaction type');
      expect(() => normalizeToStorageType('')).toThrow('SECURITY: Unknown transaction type');
      expect(() => normalizeToStorageType('some_random_string')).toThrow('SECURITY: Unknown transaction type');
    });

    it('the exact bug that caused loan 221 failure is now impossible', () => {
      // Before: signing ceremony used 'DEFAULT_LIQUIDATION' as type, resolution looked for 'default'
      // Now: normalizeToStorageType('DEFAULT_LIQUIDATION') === 'default'
      const ceremonyType = normalizeToStorageType('DEFAULT_LIQUIDATION');
      const resolutionType = decisionToStorageType('BORROWER_DEFAULTED');
      expect(ceremonyType).toBe(resolutionType);

      // Same for recovery
      const ceremonyCeremonyRecovery = normalizeToStorageType('BORROWER_RECOVERY');
      expect(ceremonyCeremonyRecovery).toBe('recovery');
    });
  });

  describe('decisionToStorageType', () => {
    it('maps all valid resolution decisions to storage types', () => {
      expect(decisionToStorageType('BORROWER_NOT_DEFAULTED')).toBe('repayment');
      expect(decisionToStorageType('BORROWER_DEFAULTED')).toBe('default');
      expect(decisionToStorageType('TIMEOUT_DEFAULT')).toBe('liquidation');
    });

    it('throws on invalid decisions', () => {
      expect(() => decisionToStorageType('INVALID')).toThrow('SECURITY: Unknown resolution decision');
      expect(() => decisionToStorageType('')).toThrow('SECURITY: Unknown resolution decision');
    });
  });

  describe('isValidStorageType', () => {
    it('validates canonical storage types', () => {
      expect(isValidStorageType('repayment')).toBe(true);
      expect(isValidStorageType('default')).toBe(true);
      expect(isValidStorageType('liquidation')).toBe(true);
      expect(isValidStorageType('recovery')).toBe(true);
    });

    it('rejects non-canonical types', () => {
      expect(isValidStorageType('REPAYMENT')).toBe(false);
      expect(isValidStorageType('DEFAULT_LIQUIDATION')).toBe(false);
      expect(isValidStorageType('BORROWER_RECOVERY')).toBe(false);
      expect(isValidStorageType('unknown')).toBe(false);
    });
  });

  describe('Cross-system consistency guarantee', () => {
    it('all decision outcomes map to valid storage types', () => {
      const decisions = ['BORROWER_NOT_DEFAULTED', 'BORROWER_DEFAULTED', 'TIMEOUT_DEFAULT'];
      for (const decision of decisions) {
        const storageType = decisionToStorageType(decision);
        expect(isValidStorageType(storageType)).toBe(true);
      }
    });

    it('all display types normalize to valid storage types', () => {
      const displayTypes = [
        'REPAYMENT', 'DEFAULT_LIQUIDATION', 'BORROWER_RECOVERY', 'LIQUIDATION',
        'repayment', 'default', 'liquidation', 'recovery',
        'default_liquidation', 'borrower_recovery',
      ];
      for (const displayType of displayTypes) {
        const storageType = normalizeToStorageType(displayType);
        expect(isValidStorageType(storageType)).toBe(true);
      }
    });

    it('signing ceremony types and resolution types always align', () => {
      // Signing ceremony receives types like DEFAULT_LIQUIDATION from frontend templates
      // Resolution maps decisions to storage types
      // These MUST produce the same storage type for the same concept

      // "default/defaulted" path
      expect(normalizeToStorageType('DEFAULT_LIQUIDATION')).toBe(decisionToStorageType('BORROWER_DEFAULTED'));

      // "repayment" path
      expect(normalizeToStorageType('REPAYMENT')).toBe(decisionToStorageType('BORROWER_NOT_DEFAULTED'));
    });
  });
});
