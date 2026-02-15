/**
 * Collateral Release Service
 * 
 * Handles the automatic release of Bitcoin collateral when a loan is repaid.
 * Uses the platform's signing key combined with either borrower or lender signatures
 * to create a valid 2-of-3 multisig transaction and broadcast to testnet4.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BitcoinEscrowService } from './BitcoinEscrowService.js';
import { broadcastTransaction } from './bitcoin-broadcast.js';
import { getUtxoUrl, getExplorerUrl, getNetworkParams } from './bitcoin-network-selector.js';
import { PsbtCreatorService } from './PsbtCreatorService.js';
import type { IStorage } from '../storage.js';

bitcoin.initEccLib(ecc);

/**
 * Convert a raw DER-encoded signature to 64-byte compact format (r || s)
 * Uses bitcoinjs-lib's built-in script.signature.decode for robust parsing.
 * Input: raw DER bytes (without sighash type byte)
 * Output: 64-byte compact signature suitable for ecc.verify
 */
function derToCompact(der: Buffer): Buffer | null {
  try {
    const derWithHashType = Buffer.concat([der, Buffer.from([bitcoin.Transaction.SIGHASH_ALL])]);
    const decoded = bitcoin.script.signature.decode(derWithHashType);
    return Buffer.from(decoded.signature);
  } catch {
    return null;
  }
}

// Get network params dynamically from network selector
function getNetwork(): bitcoin.Network {
  const params = getNetworkParams();
  return {
    messagePrefix: params.messagePrefix,
    bech32: params.bech32,
    bip32: params.bip32,
    pubKeyHash: params.pubKeyHash,
    scriptHash: params.scriptHash,
    wif: params.wif,
  };
}

export interface ReleaseResult {
  success: boolean;
  txid?: string;
  error?: string;
  broadcastUrl?: string;
}

interface UTXOInfo {
  txid: string;
  vout: number;
  value: number;
}

/**
 * Fetch UTXOs for an address from mempool.space testnet4 API
 */
async function fetchUTXOs(address: string): Promise<UTXOInfo[]> {
  const axios = (await import('axios')).default;
  
  try {
    const response = await axios.get(
      getUtxoUrl(address),
      { timeout: 15000 }
    );
    
    return response.data.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));
  } catch (error: any) {
    console.error('Failed to fetch UTXOs:', error.message);
    return [];
  }
}

/**
 * Helper wrapper for broadcasting using the shared broadcastTransaction function
 */
async function broadcastToTestnet4(txHex: string): Promise<string> {
  const result = await broadcastTransaction(txHex);
  if (!result.success) {
    throw new Error(result.error || 'Broadcast failed');
  }
  return result.txid!;
}

/**
 * Build witness script from sorted public keys for 2-of-3 multisig
 */
function buildWitnessScript(pubkeys: string[]): Buffer {
  const sortedPubkeys = [...pubkeys].sort();
  
  const script: number[] = [];
  script.push(0x52); // OP_2
  
  for (const pubkeyHex of sortedPubkeys) {
    const pubkeyBytes = Buffer.from(pubkeyHex, 'hex');
    script.push(pubkeyBytes.length);
    script.push(...Array.from(pubkeyBytes));
  }
  
  script.push(0x53); // OP_3
  script.push(0xae); // OP_CHECKMULTISIG
  
  return Buffer.from(script);
}

/**
 * Sign a PSBT input with a private key
 */
function signPsbtInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  privateKeyHex: string,
  witnessScript: Buffer
): void {
  const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
  const keyPair = {
    publicKey: Buffer.from(ecc.pointFromScalar(privateKeyBuffer, true)!),
    privateKey: privateKeyBuffer,
    sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privateKeyBuffer)),
  };
  
  psbt.signInput(inputIndex, keyPair);
}

/**
 * Add platform and lender signatures to a pre-signed PSBT and broadcast
 * Used when borrower has already signed during signing ceremony
 * 
 * SECURITY: Validates PSBT before co-signing to ensure it matches escrow
 */
async function addPlatformSignaturesAndBroadcast(
  storage: any,
  loan: any,
  psbtBase64: string,
  EncryptionService: any,
  preSignedTxId?: number  // Optional: ID of pre-signed transaction record for status update
): Promise<ReleaseResult> {
  try {
    const network = getNetwork();
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    
    // SECURITY: Verify PSBT input has borrower's signature
    const input = psbt.data.inputs[0];
    if (!input.partialSig || input.partialSig.length === 0) {
      return { success: false, error: 'SECURITY: Pre-signed PSBT has no borrower signature' };
    }
    
    // SECURITY: Require witnessScript to be present - prevents bypass
    if (!input.witnessScript) {
      return { success: false, error: 'SECURITY: PSBT missing witnessScript - cannot verify escrow' };
    }
    
    // SECURITY: Verify witness script matches loan's escrow script
    if (loan.escrowWitnessScript) {
      const psbtWitnessHex = input.witnessScript.toString('hex').toLowerCase();
      const expectedWitnessHex = loan.escrowWitnessScript.toLowerCase();
      if (psbtWitnessHex !== expectedWitnessHex) {
        return { success: false, error: 'SECURITY: PSBT witness script does not match escrow' };
      }
    } else {
      return { success: false, error: 'SECURITY: Loan has no escrow witness script' };
    }
    
    // SECURITY: Cryptographically verify borrower's signature (not just presence)
    if (!loan.borrowerPubkey) {
      return { success: false, error: 'SECURITY: No borrower pubkey to verify signature' };
    }
    
    const isValidSig = PsbtCreatorService.verifySignature(psbtBase64, loan.borrowerPubkey, 0);
    if (!isValidSig) {
      return { success: false, error: 'SECURITY: Borrower signature cryptographic verification failed' };
    }
    
    // SECURITY: Verify PSBT input matches escrow UTXO (txid/vout)
    if (loan.fundingTxid) {
      const expectedVout = loan.fundingVout ?? 0;
      const utxoMatch = PsbtCreatorService.verifyPsbtUtxo(psbtBase64, loan.fundingTxid, expectedVout);
      if (!utxoMatch) {
        return { success: false, error: 'SECURITY: PSBT input does not match escrow UTXO' };
      }
    }
    
    console.log('✅ PSBT security validation passed (cryptographic verification)');
    
    // Get platform private key
    const platformPrivateKey = BitcoinEscrowService.getPlatformPrivateKey();
    
    // Get and decrypt lender private key
    if (!loan.lenderPrivateKeyEncrypted) {
      return { success: false, error: 'No encrypted lender key found' };
    }
    
    const lenderPrivateKey = EncryptionService.decrypt(loan.lenderPrivateKeyEncrypted);
    
    // Sign all inputs with platform key
    const inputCount = psbt.inputCount;
    for (let i = 0; i < inputCount; i++) {
      try {
        const platformKeyBuffer = Buffer.from(platformPrivateKey, 'hex');
        const platformKeyPair = {
          publicKey: Buffer.from(ecc.pointFromScalar(platformKeyBuffer, true)!),
          privateKey: platformKeyBuffer,
          sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, platformKeyBuffer)),
        };
        psbt.signInput(i, platformKeyPair);
      } catch (e) {
        // May already be signed or wrong key - continue
      }
    }
    
    // Sign all inputs with lender key (platform-controlled)
    for (let i = 0; i < inputCount; i++) {
      try {
        const lenderKeyBuffer = Buffer.from(lenderPrivateKey, 'hex');
        const lenderKeyPair = {
          publicKey: Buffer.from(ecc.pointFromScalar(lenderKeyBuffer, true)!),
          privateKey: lenderKeyBuffer,
          sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, lenderKeyBuffer)),
        };
        psbt.signInput(i, lenderKeyPair);
      } catch (e) {
        // May already be signed or wrong key - continue
      }
    }
    
    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();
    
    console.log(`✅ Pre-signed transaction finalized: ${txid}`);
    
    // Broadcast
    const broadcastTxid = await broadcastToTestnet4(txHex);
    
    // Update broadcast status in database if we have the transaction record ID
    if (preSignedTxId && storage.updateTransactionBroadcastStatus) {
      try {
        await storage.updateTransactionBroadcastStatus(preSignedTxId, {
          broadcastStatus: 'broadcast',
          broadcastTxid: broadcastTxid,
          broadcastedAt: new Date()
        });
        console.log(`📊 Updated pre-signed transaction #${preSignedTxId} status to 'broadcast'`);
      } catch (updateError: any) {
        console.warn(`⚠️ Failed to update broadcast status: ${updateError.message}`);
        // Non-fatal - transaction was already broadcast successfully
      }
    }
    
    return {
      success: true,
      txid: broadcastTxid,
      broadcastUrl: getExplorerUrl('tx', broadcastTxid),
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Pre-signed transaction error: ${error.message}`
    };
  }
}

/**
 * Add ONLY the lender signature to a pre-signed PSBT and broadcast.
 * Used for legacy loans with platform key mismatch where escrow is 2-of-3.
 * Borrower's signature is already present, so borrower+lender = 2 sigs = valid.
 */
async function addLenderOnlySignatureAndBroadcast(
  storage: any,
  loan: any,
  psbtBase64: string,
  EncryptionService: any,
  preSignedTxId?: number
): Promise<ReleaseResult> {
  try {
    const network = getNetwork();
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    
    const input = psbt.data.inputs[0];
    if (!input.partialSig || input.partialSig.length === 0) {
      return { success: false, error: 'SECURITY: Pre-signed PSBT has no borrower signature' };
    }
    
    if (!input.witnessScript) {
      return { success: false, error: 'SECURITY: PSBT missing witnessScript' };
    }
    
    if (loan.escrowWitnessScript) {
      const psbtWitnessHex = input.witnessScript.toString('hex').toLowerCase();
      const expectedWitnessHex = loan.escrowWitnessScript.toLowerCase();
      if (psbtWitnessHex !== expectedWitnessHex) {
        return { success: false, error: 'SECURITY: PSBT witness script does not match escrow' };
      }
    }
    
    const scriptBytes = Buffer.from(loan.escrowWitnessScript, 'hex');
    const mRequired = scriptBytes[0] - 0x50;
    console.log(`   Escrow multisig requires ${mRequired}-of-3 signatures`);
    
    if (mRequired > 2) {
      return { success: false, error: `Escrow requires ${mRequired}-of-3 - need platform key which has changed` };
    }
    
    if (loan.borrowerPubkey) {
      const isValidSig = PsbtCreatorService.verifySignature(psbtBase64, loan.borrowerPubkey, 0);
      if (!isValidSig) {
        return { success: false, error: 'SECURITY: Borrower signature verification failed' };
      }
    }
    
    if (!loan.lenderPrivateKeyEncrypted) {
      return { success: false, error: 'No encrypted lender key found' };
    }
    
    const lenderPrivateKey = EncryptionService.decrypt(loan.lenderPrivateKeyEncrypted);
    
    const inputCount = psbt.inputCount;
    for (let i = 0; i < inputCount; i++) {
      try {
        const lenderKeyBuffer = Buffer.from(lenderPrivateKey, 'hex');
        const lenderKeyPair = {
          publicKey: Buffer.from(ecc.pointFromScalar(lenderKeyBuffer, true)!),
          privateKey: lenderKeyBuffer,
          sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, lenderKeyBuffer)),
        };
        psbt.signInput(i, lenderKeyPair);
      } catch (e: any) {
        console.warn(`   Lender signing input ${i} failed: ${e.message}`);
      }
    }
    
    const sigCountAfter = psbt.data.inputs[0]?.partialSig?.length || 0;
    console.log(`   Signatures after lender signing: ${sigCountAfter}/${mRequired} required`);
    
    if (sigCountAfter < mRequired) {
      return { success: false, error: `Only ${sigCountAfter} signatures, need ${mRequired}` };
    }
    
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();
    
    console.log(`✅ [LEGACY] Transaction finalized with borrower+lender keys: ${txid}`);
    
    const broadcastTxid = await broadcastToTestnet4(txHex);
    
    if (preSignedTxId && storage.updateTransactionBroadcastStatus) {
      try {
        await storage.updateTransactionBroadcastStatus(preSignedTxId, {
          broadcastStatus: 'broadcast',
          broadcastTxid: broadcastTxid,
          broadcastedAt: new Date()
        });
      } catch (updateError: any) {
        console.warn(`⚠️ Failed to update broadcast status: ${updateError.message}`);
      }
    }
    
    return {
      success: true,
      txid: broadcastTxid,
      broadcastUrl: getExplorerUrl('tx', broadcastTxid),
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Legacy release error: ${error.message}`
    };
  }
}

/**
 * Create and broadcast a cooperative close transaction
 * This releases the borrower's collateral after successful loan repayment
 * 
 * Bitcoin-Blind Lender Model: Platform controls 2 of 3 keys:
 * - Platform's own key
 * - Lender's key (generated and encrypted by platform)
 * 
 * This allows automatic collateral return without borrower participation
 * when the lender confirms repayment has been received.
 */
export async function releaseCollateral(
  storage: IStorage,
  loanId: number
): Promise<ReleaseResult> {
  console.log(`🔐 Starting collateral release for loan #${loanId}`);
  
  try {
    // Dynamic import to avoid circular dependency
    const { EncryptionService } = await import('./EncryptionService.js');
    
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (!loan.escrowAddress) {
      return { success: false, error: 'No escrow address found' };
    }
    
    // ================================================================
    // PLATFORM KEY MATCH VERIFICATION
    // Ensures we can actually sign with the current platform key
    // ================================================================
    const currentPlatformPubkey = BitcoinEscrowService.getPlatformPublicKey();
    
    let platformKeyMismatch = false;
    if (!loan.platformPubkey) {
      console.warn(`⚠️ [COLLATERAL-RELEASE] Loan #${loanId} has no recorded platform key (old loan)`);
      console.warn(`   Current platform key: ${currentPlatformPubkey}`);
      console.warn(`   Proceeding anyway for backwards compatibility...`);
    } else if (loan.platformPubkey !== currentPlatformPubkey) {
      platformKeyMismatch = true;
      console.warn(`⚠️ [COLLATERAL-RELEASE] Platform key mismatch for loan #${loanId}`);
      console.warn(`   Loan created with: ${loan.platformPubkey}`);
      console.warn(`   Current key is:    ${currentPlatformPubkey}`);
      console.warn(`   Will attempt borrower+lender only signing (2-of-3 multisig)`);
    } else {
      console.log(`✅ [COLLATERAL-RELEASE] Platform key match verified for loan #${loanId}`);
    }
    
    // Get borrower's BTC return address from user record
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower || !borrower.btcAddress) {
      return { success: false, error: 'No borrower return address found' };
    }
    
    // ================================================================
    // STEP 1: Try to use pre-signed REPAYMENT transaction if available
    // ================================================================
    const hasPreSignedTx = loan.txRepaymentHex || loan.borrowerSigningComplete;
    
    if (hasPreSignedTx && loan.txRepaymentHex) {
      console.log(`📋 Found pre-signed REPAYMENT transaction for loan #${loanId}`);
      console.log(`   Using pre-signed transaction model (Firefish non-custodial)`);
      
      try {
        const preSignedTxs = await storage.getPreSignedTransactions(loanId);
        const repaymentTxs = preSignedTxs.filter(tx => 
          tx.txType === 'repayment' || tx.txType === 'cooperative_close' || tx.txType === 'REPAYMENT'
        );
        
        let psbtBase64 = loan.txRepaymentHex;
        let preSignedTxId: number | undefined;
        
        if (repaymentTxs.length > 0) {
          psbtBase64 = repaymentTxs[0].psbt;
          preSignedTxId = repaymentTxs[0].id;
          console.log(`   Using PSBT from pre_signed_transactions table (record #${preSignedTxId})`);
        }
        
        if (platformKeyMismatch) {
          console.log(`🔄 [LEGACY-RELEASE] Platform key mismatch - attempting borrower+lender signing (2-of-3)`);
          const legacyResult = await addLenderOnlySignatureAndBroadcast(
            storage, loan, psbtBase64, EncryptionService, preSignedTxId
          );
          if (legacyResult.success) {
            console.log(`✅ [LEGACY-RELEASE] Transaction broadcast successful: ${legacyResult.txid}`);
            return legacyResult;
          }
          console.log(`⚠️ Legacy borrower+lender signing failed: ${legacyResult.error}`);
        } else {
          const result = await addPlatformSignaturesAndBroadcast(
            storage, loan, psbtBase64, EncryptionService, preSignedTxId
          );
          if (result.success) {
            console.log(`✅ [PRE-SIGNED] Transaction broadcast successful: ${result.txid}`);
            return result;
          }
          console.log(`⚠️ Pre-signed approach failed: ${result.error}`);
          console.log(`   Falling back to dynamic transaction creation...`);
        }
      } catch (preSignedError: any) {
        console.log(`⚠️ Pre-signed transaction error: ${preSignedError.message}`);
        console.log(`   Falling back to dynamic transaction creation...`);
      }
    } else if (platformKeyMismatch && loan.borrowerSigningComplete) {
      console.log(`📋 Borrower signing complete but no txRepaymentHex - checking pre_signed_transactions table`);
      try {
        const preSignedTxs = await storage.getPreSignedTransactions(loanId);
        const repaymentTxs = preSignedTxs.filter(tx => 
          tx.txType === 'repayment' || tx.txType === 'cooperative_close' || tx.txType === 'REPAYMENT'
        );
        if (repaymentTxs.length > 0) {
          const psbtBase64 = repaymentTxs[0].psbt;
          const preSignedTxId = repaymentTxs[0].id;
          console.log(`   Found PSBT in pre_signed_transactions (record #${preSignedTxId})`);
          const legacyResult = await addLenderOnlySignatureAndBroadcast(
            storage, loan, psbtBase64, EncryptionService, preSignedTxId
          );
          if (legacyResult.success) {
            console.log(`✅ [LEGACY-RELEASE] Transaction broadcast successful: ${legacyResult.txid}`);
            return legacyResult;
          }
          console.log(`⚠️ Legacy borrower+lender signing failed: ${legacyResult.error}`);
        } else {
          console.log(`❌ No pre-signed REPAYMENT PSBTs found for legacy loan #${loanId}`);
        }
      } catch (e: any) {
        console.log(`⚠️ Error checking pre-signed transactions: ${e.message}`);
      }
    } else {
      console.log(`🚫 No pre-signed transaction found for loan #${loanId}`);
    }
    
    // ================================================================
    // SECURITY: Dynamic transaction creation is BLOCKED
    // All collateral releases MUST use pre-signed PSBTs that were
    // locked in during the borrower signing ceremony. This prevents
    // any attack where a compromised admin changes destination addresses.
    // ================================================================
    console.error(`❌ [SECURITY] Collateral release blocked for loan #${loanId}: No pre-signed PSBT available.`);
    console.error(`   Dynamic transaction creation is disabled for security.`);
    console.error(`   All loans must complete the signing ceremony before collateral can be released.`);
    return {
      success: false,
      error: 'No pre-signed transaction available. Dynamic transaction creation is disabled for security. ' +
             'The borrower must complete the signing ceremony before collateral can be released.'
    };
    
  } catch (error: any) {
    console.error('Collateral release error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during collateral release',
    };
  }
}

/**
 * Release collateral to a specific address (for liquidation to lender)
 * Used when LTV threshold is breached and collateral goes to lender
 * 
 * Bitcoin-Blind Lender Model: Platform controls 2 of 3 keys:
 * - Platform's own key
 * - Lender's key (generated and encrypted by platform)
 * 
 * This allows automatic liquidation without borrower participation
 */
export async function releaseCollateralToAddress(
  loanId: number,
  destinationAddress: string
): Promise<ReleaseResult> {
  console.log(`🔐 Starting collateral liquidation for loan #${loanId}`);
  
  try {
    const { storage } = await import('../storage.js');
    
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (!loan.escrowAddress) {
      return { success: false, error: 'No escrow address found' };
    }
    
    // ================================================================
    // SECURITY: Liquidation MUST use pre-signed transaction templates
    // Dynamic transaction creation is blocked to prevent address
    // substitution attacks from compromised admin accounts.
    // ================================================================
    const txHex = loan.txLiquidationHex || loan.txDefaultHex;
    
    if (!txHex) {
      console.error(`❌ [SECURITY] Liquidation blocked for loan #${loanId}: No pre-signed liquidation PSBT available.`);
      console.error(`   Dynamic transaction creation is disabled for security.`);
      return {
        success: false,
        error: 'No pre-signed liquidation transaction available. Dynamic transaction creation is disabled for security. ' +
               'The borrower must complete the signing ceremony before liquidation can proceed.'
      };
    }
    
    console.log(`📋 Using pre-signed liquidation transaction for loan #${loanId}`);
    
    try {
      const broadcastTxid = await broadcastToTestnet4(txHex);
      console.log(`📡 Liquidation broadcast successful: ${broadcastTxid}`);
      
      return {
        success: true,
        txid: broadcastTxid,
        broadcastUrl: getExplorerUrl('tx', broadcastTxid),
      };
    } catch (broadcastError: any) {
      console.error('Failed to broadcast pre-signed liquidation:', broadcastError.message);
      return {
        success: false,
        error: `Could not broadcast liquidation transaction: ${broadcastError.message}`,
      };
    }
    
  } catch (error: any) {
    console.error('Liquidation release error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during liquidation',
    };
  }
}

/**
 * Prepare recovery sighashes for borrower-assisted collateral release.
 * Used when platform key has changed and we need borrower + lender (2-of-3) signatures.
 * 
 * NON-CUSTODIAL FLOW (borrower key never leaves the browser):
 * 1. Server creates unsigned transaction with real funded UTXOs
 * 2. Server computes BIP 143 sighashes for each input
 * 3. Returns sighashes + transaction details to client
 * 4. Client derives borrower key from passphrase and signs sighashes
 * 5. Client sends DER signatures back to server
 * 6. Server rebuilds PSBT, adds both borrower + lender signatures, broadcasts
 */
export async function prepareRecoverySighashes(
  storage: IStorage,
  loanId: number
): Promise<{
  success: boolean;
  sighashes?: string[];
  error?: string;
  txDetails?: {
    utxos: UTXOInfo[];
    outputValue: number;
    fee: number;
    destinationAddress: string;
    totalInputValue: number;
    signaturesRequired: number;
  };
}> {
  console.log(`🔐 [RECOVERY] Preparing recovery sighashes for loan #${loanId}`);
  
  try {
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (!loan.escrowAddress) {
      return { success: false, error: 'No escrow address found' };
    }
    
    if (!loan.escrowWitnessScript) {
      return { success: false, error: 'No witness script found for escrow' };
    }
    
    if (!loan.borrowerPubkey) {
      return { success: false, error: 'No borrower public key found' };
    }
    
    if (loan.collateralReleased) {
      return { success: false, error: 'Collateral has already been released' };
    }
    
    const scriptBytes = Buffer.from(loan.escrowWitnessScript, 'hex');
    const mRequired = scriptBytes[0] - 0x50;
    console.log(`   Escrow requires ${mRequired}-of-3 signatures`);
    
    if (mRequired > 2) {
      return { success: false, error: `Escrow requires ${mRequired}-of-3 signatures. Recovery needs 2-of-3 escrow.` };
    }
    
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower || !borrower.btcAddress) {
      return { success: false, error: 'No borrower return address found. Please set your BTC address in settings.' };
    }
    
    console.log(`📡 [RECOVERY] Fetching UTXOs from escrow: ${loan.escrowAddress}`);
    const utxos = await fetchUTXOs(loan.escrowAddress);
    
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs found in escrow address - funds may have already been spent' };
    }
    
    let totalInputValue = 0;
    for (const utxo of utxos) {
      console.log(`   UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
      totalInputValue += utxo.value;
    }
    
    const witnessScript = Buffer.from(loan.escrowWitnessScript, 'hex');
    
    const { estimateMultisigFee: estimateMultisigFeeRecovery } = await import('./fee-estimator.js');
    const feeEstimateRecovery = await estimateMultisigFeeRecovery('medium', utxos.length, 1);
    const fee = feeEstimateRecovery.feeSats;
    const outputValue = totalInputValue - fee;
    
    if (outputValue <= 546) {
      return { success: false, error: 'UTXO value too small to cover fees (dust limit)' };
    }
    
    console.log(`💰 [RECOVERY] Transaction: ${totalInputValue} - ${fee} = ${outputValue} sats → ${borrower.btcAddress} (${feeEstimateRecovery.feeRate} sat/vB × ${feeEstimateRecovery.estimatedVbytes} vB, source: ${feeEstimateRecovery.source})`);
    
    const network = getNetwork();
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    
    for (const utxo of utxos) {
      tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout);
    }
    
    tx.addOutput(
      bitcoin.address.toOutputScript(borrower.btcAddress, network),
      BigInt(outputValue)
    );
    
    const sighashes: string[] = [];
    for (let i = 0; i < utxos.length; i++) {
      const hash = tx.hashForWitnessV0(
        i,
        witnessScript,
        BigInt(utxos[i].value),
        bitcoin.Transaction.SIGHASH_ALL
      );
      const hashHex = Buffer.from(hash).toString('hex');
      sighashes.push(hashHex);
      console.log(`   Sighash for input ${i}: ${hashHex.slice(0, 16)}...`);
    }
    
    return {
      success: true,
      sighashes,
      txDetails: {
        utxos,
        outputValue,
        fee,
        destinationAddress: borrower.btcAddress,
        totalInputValue,
        signaturesRequired: mRequired,
      },
    };
  } catch (error: any) {
    console.error(`[RECOVERY] Error preparing sighashes:`, error);
    return { success: false, error: `Recovery sighash preparation failed: ${error.message}` };
  }
}

/**
 * Complete the recovery: rebuild PSBT with borrower's DER signatures + lender key, broadcast.
 * 
 * Takes the borrower's raw DER signatures (one per input), rebuilds the exact same
 * transaction, adds both borrower and lender partialSig entries, finalizes, broadcasts.
 */
export async function completeRecoveryWithSignatures(
  storage: IStorage,
  loanId: number,
  borrowerSignatures: string[]
): Promise<ReleaseResult> {
  console.log(`🔐 [RECOVERY] Completing recovery for loan #${loanId} with ${borrowerSignatures.length} borrower signature(s)`);
  
  try {
    const { EncryptionService } = await import('./EncryptionService.js');
    
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (loan.collateralReleased) {
      return { success: false, error: 'Collateral has already been released' };
    }
    
    if (!loan.escrowAddress || !loan.escrowWitnessScript || !loan.borrowerPubkey) {
      return { success: false, error: 'Missing escrow data (address, witness script, or borrower pubkey)' };
    }
    
    if (!loan.lenderPrivateKeyEncrypted) {
      return { success: false, error: 'No encrypted lender key found' };
    }
    
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower || !borrower.btcAddress) {
      return { success: false, error: 'No borrower return address found' };
    }
    
    const utxos = await fetchUTXOs(loan.escrowAddress);
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs found in escrow' };
    }
    
    if (borrowerSignatures.length !== utxos.length) {
      return { 
        success: false, 
        error: `Expected ${utxos.length} signature(s), got ${borrowerSignatures.length}` 
      };
    }
    
    let totalInputValue = 0;
    for (const utxo of utxos) {
      totalInputValue += utxo.value;
    }
    
    const witnessScript = Buffer.from(loan.escrowWitnessScript, 'hex');
    const { estimateMultisigFee: estimateMultisigFeeVerify } = await import('./fee-estimator.js');
    const feeEstimateVerify = await estimateMultisigFeeVerify('medium', utxos.length, 1);
    const fee = feeEstimateVerify.feeSats;
    const outputValue = totalInputValue - fee;
    
    if (outputValue <= 546) {
      return { success: false, error: 'UTXO value too small to cover fees' };
    }
    
    const network = getNetwork();
    
    const verifyTx = new bitcoin.Transaction();
    verifyTx.version = 2;
    for (const utxo of utxos) {
      verifyTx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout);
    }
    verifyTx.addOutput(
      bitcoin.address.toOutputScript(borrower.btcAddress, network),
      BigInt(outputValue)
    );
    
    const borrowerPubkeyBuf = Buffer.from(loan.borrowerPubkey, 'hex');
    
    for (let i = 0; i < utxos.length; i++) {
      const sighashRaw = verifyTx.hashForWitnessV0(
        i,
        witnessScript,
        BigInt(utxos[i].value),
        bitcoin.Transaction.SIGHASH_ALL
      );
      const sighash = Buffer.from(sighashRaw);
      
      const sigDer = Buffer.from(borrowerSignatures[i], 'hex');
      const sigCompact = derToCompact(sigDer);
      
      if (!sigCompact) {
        return { success: false, error: `Invalid DER signature format for input ${i}` };
      }
      
      console.log(`   Verifying input ${i}: sighash=${sighash.toString('hex').slice(0, 16)}... pubkey=${loan.borrowerPubkey!.slice(0, 16)}... derSigLen=${sigDer.length}`);
      const isValid = ecc.verify(sighash, borrowerPubkeyBuf, sigCompact);
      if (!isValid) {
        console.error(`   SECURITY: Borrower signature verification FAILED for input ${i}`);
        return { 
          success: false, 
          error: `Borrower signature verification failed for input ${i}. Wrong passphrase or corrupted signature.` 
        };
      }
      console.log(`   Borrower signature for input ${i} verified against BIP143 sighash`);
    }
    
    const psbt = new bitcoin.Psbt({ network });
    
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wsh({
            redeem: { output: witnessScript, network },
            network,
          }).output!,
          value: BigInt(utxo.value),
        },
        witnessScript: witnessScript,
      });
    }
    
    psbt.addOutput({
      address: borrower.btcAddress,
      value: BigInt(outputValue),
    });
    
    for (let i = 0; i < utxos.length; i++) {
      const sigDer = Buffer.from(borrowerSignatures[i], 'hex');
      const sigWithHashType = Buffer.concat([sigDer, Buffer.from([bitcoin.Transaction.SIGHASH_ALL])]);
      
      psbt.data.inputs[i].partialSig = psbt.data.inputs[i].partialSig || [];
      psbt.data.inputs[i].partialSig!.push({
        pubkey: borrowerPubkeyBuf,
        signature: sigWithHashType,
      });
      console.log(`   Added verified borrower signature for input ${i}`);
    }
    
    const lenderPrivateKey = EncryptionService.decrypt(loan.lenderPrivateKeyEncrypted);
    console.log(`🔑 [RECOVERY] Signing with lender key (platform-controlled)...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, lenderPrivateKey, witnessScript);
    }
    
    const sigCount = psbt.data.inputs[0]?.partialSig?.length || 0;
    console.log(`   Total signatures: ${sigCount}`);
    
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();
    
    console.log(`✅ [RECOVERY] Transaction finalized: ${txid}`);
    
    const broadcastTxid = await broadcastToTestnet4(txHex);
    console.log(`📡 [RECOVERY] Broadcast successful: ${broadcastTxid}`);
    
    return {
      success: true,
      txid: broadcastTxid,
      broadcastUrl: getExplorerUrl('tx', broadcastTxid),
    };
  } catch (error: any) {
    console.error(`[RECOVERY] Broadcast error:`, error);
    return {
      success: false,
      error: `Recovery broadcast failed: ${error.message}`
    };
  }
}
