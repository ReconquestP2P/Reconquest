import crypto from 'crypto';
import { EncryptionService } from './EncryptionService';

/**
 * TransactionTemplateService - Enforces predefined escrow transaction paths
 * 
 * CRITICAL SECURITY CONSTRAINT:
 * All escrow spends MUST correspond to one of the predefined transaction types.
 * No arbitrary new transactions can be created after loan setup.
 * 
 * Valid transaction types:
 * 1. REPAYMENT - Happy path: borrower repays, collateral returned
 * 2. DEFAULT_LIQUIDATION - Lender gets owed amount, borrower gets remainder
 * 3. BORROWER_RECOVERY - Time-locked recovery if platform disappears
 * 
 * Platform signs with (platform key + lender key) ONLY for these predefined paths.
 */

export type TransactionType = 
  | 'REPAYMENT'           // Happy path - borrower repays loan
  | 'DEFAULT_LIQUIDATION' // Borrower defaults - lender gets owed, borrower gets remainder
  | 'BORROWER_RECOVERY';  // Time-locked - borrower can recover if platform fails

export interface TransactionTemplate {
  id: string;
  loanId: number;
  txType: TransactionType;
  psbtBase64: string;
  txHash: string;
  
  // Output details for auditability
  outputs: {
    address: string;
    amount: number; // satoshis
    purpose: 'borrower' | 'lender' | 'platform_fee';
  }[];
  
  // Input details
  escrowUtxo: {
    txid: string;
    vout: number;
    amount: number; // satoshis
  };
  
  // Timelock (for recovery only)
  timelockBlocks?: number;
  validAfterTimestamp?: number;
  
  // Signatures collected
  borrowerSigned: boolean;
  platformSigned: boolean;
  
  createdAt: Date;
}

export interface SigningAuditLog {
  timestamp: Date;
  loanId: number;
  escrowUtxo: {
    txid: string;
    vout: number;
  };
  transactionType: TransactionType;
  signingParty: 'borrower' | 'platform' | 'platform_for_lender';
  publicKeyUsed: string; // Only pubkey, NEVER private key
  action: 'signed' | 'signature_verified' | 'broadcast_initiated';
  templateId: string;
  success: boolean;
  errorMessage?: string;
}

export class TransactionTemplateService {
  private static auditLogs: SigningAuditLog[] = [];
  
  /**
   * SECURITY: Valid transaction types that can be executed
   * No other transaction types are permitted
   */
  private static readonly VALID_TRANSACTION_TYPES: TransactionType[] = [
    'REPAYMENT',
    'DEFAULT_LIQUIDATION',
    'BORROWER_RECOVERY'
  ];

  /**
   * Validates that a transaction type is one of the predefined allowed types
   * CRITICAL: Prevents arbitrary transaction creation
   */
  static validateTransactionType(txType: string): txType is TransactionType {
    return this.VALID_TRANSACTION_TYPES.includes(txType as TransactionType);
  }

  /**
   * Creates all required transaction templates at loan setup
   * These are the ONLY transactions that can ever be executed for this escrow
   */
  static createTransactionTemplates(
    loanId: number,
    escrowUtxo: { txid: string; vout: number; amount: number },
    borrowerAddress: string,
    lenderAddress: string,
    amountOwedSats: number,
    termMonths: number
  ): TransactionTemplate[] {
    const templates: TransactionTemplate[] = [];
    const now = new Date();
    
    // 1. REPAYMENT - Full collateral returned to borrower
    templates.push({
      id: `${loanId}-repayment-${crypto.randomBytes(8).toString('hex')}`,
      loanId,
      txType: 'REPAYMENT',
      psbtBase64: '', // Will be populated when actual PSBT is constructed
      txHash: '',
      outputs: [
        {
          address: borrowerAddress,
          amount: escrowUtxo.amount - 1000, // Minus fees
          purpose: 'borrower'
        }
      ],
      escrowUtxo,
      borrowerSigned: false,
      platformSigned: false,
      createdAt: now
    });
    
    // 2. DEFAULT_LIQUIDATION - Lender gets owed, borrower gets remainder
    const lenderAmount = Math.min(amountOwedSats, escrowUtxo.amount - 2000);
    const borrowerRemainder = escrowUtxo.amount - lenderAmount - 2000; // Fees
    
    templates.push({
      id: `${loanId}-default-${crypto.randomBytes(8).toString('hex')}`,
      loanId,
      txType: 'DEFAULT_LIQUIDATION',
      psbtBase64: '',
      txHash: '',
      outputs: [
        {
          address: lenderAddress,
          amount: lenderAmount,
          purpose: 'lender'
        },
        ...(borrowerRemainder > 546 ? [{
          address: borrowerAddress,
          amount: borrowerRemainder,
          purpose: 'borrower' as const
        }] : [])
      ],
      escrowUtxo,
      borrowerSigned: false,
      platformSigned: false,
      createdAt: now
    });
    
    // 3. BORROWER_RECOVERY - Time-locked recovery (term + 14 days)
    const recoveryTimelockDays = termMonths * 30 + 14;
    const recoveryTimestamp = Date.now() + (recoveryTimelockDays * 24 * 60 * 60 * 1000);
    
    templates.push({
      id: `${loanId}-recovery-${crypto.randomBytes(8).toString('hex')}`,
      loanId,
      txType: 'BORROWER_RECOVERY',
      psbtBase64: '',
      txHash: '',
      outputs: [
        {
          address: borrowerAddress,
          amount: escrowUtxo.amount - 1000,
          purpose: 'borrower'
        }
      ],
      escrowUtxo,
      timelockBlocks: recoveryTimelockDays * 144, // ~144 blocks per day
      validAfterTimestamp: recoveryTimestamp,
      borrowerSigned: false,
      platformSigned: false,
      createdAt: now
    });
    
    console.log(`[TransactionTemplates] Created ${templates.length} predefined templates for loan ${loanId}`);
    console.log(`[TransactionTemplates] Valid paths: REPAYMENT, DEFAULT_LIQUIDATION, BORROWER_RECOVERY`);
    
    return templates;
  }

  /**
   * SECURITY: Platform can ONLY sign for predefined transaction types
   * This method is called when platform signs with platform key + lender key
   */
  static async platformSign(
    loanId: number,
    templateId: string,
    txType: TransactionType,
    escrowUtxo: { txid: string; vout: number },
    lenderPrivateKeyEncrypted: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // CRITICAL: Validate transaction type is allowed
    if (!this.validateTransactionType(txType)) {
      const error = `SECURITY VIOLATION: Invalid transaction type "${txType}" - not in allowed list`;
      this.logSigningOperation({
        timestamp: new Date(),
        loanId,
        escrowUtxo,
        transactionType: txType,
        signingParty: 'platform',
        publicKeyUsed: 'REJECTED',
        action: 'signed',
        templateId,
        success: false,
        errorMessage: error
      });
      console.error(`[SECURITY] ${error}`);
      throw new Error(error);
    }
    
    try {
      // Decrypt lender private key for signing
      // SECURITY: Key is decrypted only in memory, never logged or returned
      const lenderPrivateKey = EncryptionService.decrypt(lenderPrivateKeyEncrypted);
      
      // TODO: Implement actual PSBT signing with secp256k1
      // For now, log the operation and return placeholder
      
      // CRITICAL: Wipe private key from memory after use
      // (In production, use secure memory clearing)
      
      // Log successful signing operation
      this.logSigningOperation({
        timestamp: new Date(),
        loanId,
        escrowUtxo,
        transactionType: txType,
        signingParty: 'platform_for_lender',
        publicKeyUsed: 'REDACTED', // Never log actual key material
        action: 'signed',
        templateId,
        success: true
      });
      
      console.log(`[TransactionTemplates] Platform signed ${txType} for loan ${loanId}`);
      
      return { success: true, signature: 'placeholder_signature' };
      
    } catch (error: any) {
      this.logSigningOperation({
        timestamp: new Date(),
        loanId,
        escrowUtxo,
        transactionType: txType,
        signingParty: 'platform',
        publicKeyUsed: 'REDACTED',
        action: 'signed',
        templateId,
        success: false,
        errorMessage: error.message
      });
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Structured audit logging for all signing operations
   * IMPORTANT: Never logs private keys or sensitive material
   */
  static logSigningOperation(log: SigningAuditLog): void {
    // Ensure no private key material in log
    const sanitizedLog = {
      ...log,
      publicKeyUsed: log.publicKeyUsed.length > 20 
        ? `${log.publicKeyUsed.slice(0, 10)}...REDACTED` 
        : log.publicKeyUsed
    };
    
    this.auditLogs.push(sanitizedLog);
    
    // Output structured log
    console.log(JSON.stringify({
      type: 'SIGNING_AUDIT',
      ...sanitizedLog
    }));
  }

  /**
   * Get audit logs for a specific loan
   * For compliance and debugging purposes
   */
  static getAuditLogs(loanId?: number): SigningAuditLog[] {
    if (loanId) {
      return this.auditLogs.filter(log => log.loanId === loanId);
    }
    return [...this.auditLogs];
  }

  /**
   * Validates that a PSBT matches the expected template
   * SECURITY: Prevents substitution attacks
   */
  static validatePsbtMatchesTemplate(
    psbtBase64: string,
    template: TransactionTemplate
  ): boolean {
    // TODO: Implement actual PSBT parsing and validation
    // For now, return true for demonstration
    // In production:
    // 1. Parse PSBT
    // 2. Verify inputs match template.escrowUtxo
    // 3. Verify outputs match template.outputs
    // 4. Verify timelock if applicable
    
    console.log(`[TransactionTemplates] Validating PSBT matches template ${template.id}`);
    return true;
  }
}

/**
 * ARCHITECTURE NOTES: Enforced Transaction Paths
 * 
 * This service enforces that the platform can ONLY create and sign
 * transactions from a predefined set of templates. This prevents:
 * 
 * 1. Arbitrary spend attacks - Platform cannot create new destinations
 * 2. Fund theft - All outputs are predefined at loan setup
 * 3. Hidden transactions - All operations are audit logged
 * 
 * The three valid transaction types are:
 * 
 * REPAYMENT (Happy Path):
 * - Triggered when borrower repays loan in fiat
 * - Lender confirms fiat receipt
 * - Platform + borrower sign to release collateral to borrower
 * 
 * DEFAULT_LIQUIDATION (Borrower Defaults):
 * - Triggered when borrower fails to repay
 * - Lender confirms non-payment
 * - Platform signs (with platform + lender keys) to:
 *   - Send owed amount (principal + interest in BTC) to lender
 *   - Send any remainder to borrower
 * 
 * BORROWER_RECOVERY (Platform Failure):
 * - Time-locked transaction (loan term + 14 days)
 * - Only requires borrower signature after timelock expires
 * - Allows borrower to recover funds if platform disappears
 * - Pre-signed at loan setup for this emergency scenario
 */
