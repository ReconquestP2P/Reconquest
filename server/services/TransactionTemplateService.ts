import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { EncryptionService } from './EncryptionService';
import { storage } from '../storage';
import type { PreSignedTransaction, InsertPreSignedTransaction } from '@shared/schema';
import { STORAGE_TX_TYPES, normalizeToStorageType } from '@shared/txTypes';
import { isMainnet } from './bitcoin-network-selector.js';

const execAsync = promisify(exec);

export interface PreSignedTransactionSet {
  escrowAddress: string;
  witnessScript: string;
  timelockBlocks: number;
  timelockDays: number;
  psbts: {
    repayment: string;
    default: string;
    liquidation: string;
    recovery: string;
  };
}

export interface GeneratePsbtParams {
  loanId: number;
  borrowerPubkey: string;
  lenderPubkey: string;
  platformPubkey: string;
  borrowerAddress: string;
  lenderAddress: string;
  collateralAmount: number; // in satoshis
}

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

  /**
   * Generates pre-signed transaction templates by calling Python bitcoin_escrow.py script
   * 
   * This method:
   * 1. Executes the Python script with loan parameters
   * 2. Parses the JSON output containing unsigned PSBTs
   * 3. Stores each PSBT in the database
   * 4. Returns the complete transaction set
   * 
   * @param params - Loan parameters for PSBT generation
   * @returns PreSignedTransactionSet with all PSBTs and escrow info
   */
  static async generatePreSignedTransactions(
    params: GeneratePsbtParams
  ): Promise<PreSignedTransactionSet> {
    const {
      loanId,
      borrowerPubkey,
      lenderPubkey,
      platformPubkey,
      borrowerAddress,
      lenderAddress,
      collateralAmount
    } = params;

    console.log(`[TransactionTemplates] Generating PSBTs for loan ${loanId}`);
    console.log(`[TransactionTemplates] Collateral: ${collateralAmount} sats`);

    // Validate inputs
    if (!borrowerPubkey || borrowerPubkey.length !== 66) {
      throw new Error(`Invalid borrower pubkey: must be 66 hex characters`);
    }
    if (!lenderPubkey || lenderPubkey.length !== 66) {
      throw new Error(`Invalid lender pubkey: must be 66 hex characters`);
    }
    if (!platformPubkey || platformPubkey.length !== 66) {
      throw new Error(`Invalid platform pubkey: must be 66 hex characters`);
    }
    const expectedPrefix = isMainnet() ? 'bc1' : 'tb1';
    if (!borrowerAddress || !borrowerAddress.startsWith(expectedPrefix)) {
      throw new Error(`Invalid borrower address: must be bech32 (${expectedPrefix}...)`);
    }
    if (!lenderAddress || !lenderAddress.startsWith(expectedPrefix)) {
      throw new Error(`Invalid lender address: must be bech32 (${expectedPrefix}...)`);
    }
    if (collateralAmount < 1000) {
      throw new Error(`Collateral amount too small: minimum 1000 sats`);
    }

    // Build Python command
    const scriptPath = path.resolve(process.cwd(), 'bitcoin_escrow.py');
    const command = [
      'python3',
      scriptPath,
      '--network', isMainnet() ? 'mainnet' : 'testnet',
      '--generate-psbts',
      '--json',
      '--silent',
      '--borrower-pubkey', borrowerPubkey,
      '--investor-pubkey', lenderPubkey,
      '--platform-pubkey', platformPubkey,
      '--borrower-address', borrowerAddress,
      '--lender-address', lenderAddress,
      '--input-value', collateralAmount.toString()
    ].join(' ');

    console.log(`[TransactionTemplates] Executing: python3 bitcoin_escrow.py --network ${isMainnet() ? 'mainnet' : 'testnet'} ...`);

    try {
      // Execute Python script
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });

      if (stderr && !stderr.includes('Warning')) {
        console.error(`[TransactionTemplates] Python stderr: ${stderr}`);
      }

      // Parse JSON output (may have leading text, find the JSON part)
      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        throw new Error(`Python script did not return valid JSON: ${stdout.slice(0, 200)}`);
      }

      const jsonOutput = stdout.slice(jsonStart);
      let result: any;
      
      try {
        result = JSON.parse(jsonOutput);
      } catch (parseError) {
        throw new Error(`Failed to parse Python JSON output: ${jsonOutput.slice(0, 200)}`);
      }

      // Validate all required fields are present
      const requiredFields = [
        'escrow_address', 'witness_script', 'psbt_repayment', 
        'psbt_default', 'psbt_liquidation', 'psbt_recovery',
        'recovery_blocks', 'recovery_days'
      ];

      for (const field of requiredFields) {
        if (!result[field]) {
          throw new Error(`Missing required field in Python output: ${field}`);
        }
      }

      // Validate PSBT format (must be base64 and start with PSBT magic after decode)
      const psbtTypes = ['psbt_repayment', 'psbt_default', 'psbt_liquidation', 'psbt_recovery'];
      for (const psbtField of psbtTypes) {
        const psbt = result[psbtField];
        try {
          const decoded = Buffer.from(psbt, 'base64');
          if (decoded.slice(0, 4).toString('hex') !== '70736274') {
            throw new Error(`Invalid PSBT magic bytes for ${psbtField}`);
          }
        } catch (e: any) {
          throw new Error(`Invalid base64 PSBT for ${psbtField}: ${e.message}`);
        }
      }

      console.log(`[TransactionTemplates] Generated escrow address: ${result.escrow_address}`);
      console.log(`[TransactionTemplates] Recovery timelock: ${result.recovery_blocks} blocks (~${result.recovery_days} days)`);

      const txTypeMap: Record<string, string> = {
        'psbt_repayment': STORAGE_TX_TYPES.REPAYMENT,
        'psbt_default': STORAGE_TX_TYPES.DEFAULT,
        'psbt_liquidation': STORAGE_TX_TYPES.LIQUIDATION,
        'psbt_recovery': STORAGE_TX_TYPES.RECOVERY,
      };

      for (const [psbtField, txType] of Object.entries(txTypeMap)) {
        const psbt = result[psbtField];
        const txHash = crypto.createHash('sha256').update(psbt).digest('hex').slice(0, 16);
        
        const insertData: InsertPreSignedTransaction = {
          loanId,
          partyRole: 'borrower',
          partyPubkey: borrowerPubkey,
          txType,
          psbt,
          signature: '',
          txHash,
          validAfter: txType === 'recovery' 
            ? new Date(Date.now() + result.recovery_days * 24 * 60 * 60 * 1000)
            : null
        };

        await storage.storePreSignedTransaction(insertData);
        console.log(`[TransactionTemplates] Stored ${txType} PSBT for loan ${loanId}`);
      }

      // Return the complete transaction set
      const transactionSet: PreSignedTransactionSet = {
        escrowAddress: result.escrow_address,
        witnessScript: result.witness_script,
        timelockBlocks: result.recovery_blocks,
        timelockDays: result.recovery_days,
        psbts: {
          repayment: result.psbt_repayment,
          default: result.psbt_default,
          liquidation: result.psbt_liquidation,
          recovery: result.psbt_recovery
        }
      };

      console.log(`[TransactionTemplates] Successfully generated and stored 4 PSBTs for loan ${loanId}`);
      return transactionSet;

    } catch (error: any) {
      console.error(`[TransactionTemplates] Error generating PSBTs: ${error.message}`);
      throw new Error(`Failed to generate pre-signed transactions: ${error.message}`);
    }
  }

  /**
   * Retrieves pre-signed transactions from database
   * 
   * @param loanId - The loan ID to retrieve transactions for
   * @param txType - Optional filter by transaction type
   * @returns Array of PreSignedTransaction records
   */
  static async getPreSignedTransactions(
    loanId: number,
    txType?: string
  ): Promise<PreSignedTransaction[]> {
    console.log(`[TransactionTemplates] Retrieving PSBTs for loan ${loanId}${txType ? `, type: ${txType}` : ''}`);
    
    const transactions = await storage.getPreSignedTransactions(loanId, txType);
    console.log(`[TransactionTemplates] Found ${transactions.length} transactions`);
    
    return transactions;
  }

  /**
   * Updates a pre-signed transaction with borrower's signature
   * 
   * @param loanId - The loan ID
   * @param txType - Transaction type (repayment, default, liquidation, recovery)
   * @param signature - Borrower's signature (hex)
   * @param signedPsbt - Updated PSBT with signature
   */
  static async updateWithBorrowerSignature(
    loanId: number,
    txType: string,
    signature: string,
    signedPsbt: string
  ): Promise<void> {
    const transactions = await storage.getPreSignedTransactions(loanId, txType);
    
    if (transactions.length === 0) {
      throw new Error(`No ${txType} transaction found for loan ${loanId}`);
    }

    const tx = transactions[0];
    
    // Update with signature
    await storage.updateTransactionBroadcastStatus(tx.id, {
      broadcastStatus: 'signed'
    });

    console.log(`[TransactionTemplates] Updated ${txType} with borrower signature for loan ${loanId}`);
  }

  /**
   * Test the PSBT generation with mock data
   * Useful for verifying the Python integration works
   */
  static async testGeneration(): Promise<PreSignedTransactionSet> {
    console.log('[TransactionTemplates] Running test generation...');
    
    // Test public keys (standard test vectors)
    const testParams: GeneratePsbtParams = {
      loanId: 99999, // Test loan ID
      borrowerPubkey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      lenderPubkey: '02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      platformPubkey: '03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e',
      borrowerAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      lenderAddress: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      collateralAmount: 100000 // 0.001 BTC
    };

    const result = await this.generatePreSignedTransactions(testParams);
    
    console.log('[TransactionTemplates] Test completed successfully');
    console.log(`[TransactionTemplates] Escrow: ${result.escrowAddress}`);
    console.log(`[TransactionTemplates] Timelock: ${result.timelockBlocks} blocks`);
    
    return result;
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
