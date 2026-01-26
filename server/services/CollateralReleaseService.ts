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
        // Get pre-signed transactions from storage
        const preSignedTxs = await storage.getPreSignedTransactions(loanId);
        const repaymentTxs = preSignedTxs.filter(tx => 
          tx.txType === 'repayment' || tx.txType === 'cooperative_close' || tx.txType === 'REPAYMENT'
        );
        
        let psbtBase64 = loan.txRepaymentHex;
        let preSignedTxId: number | undefined;
        
        if (repaymentTxs.length > 0) {
          psbtBase64 = repaymentTxs[0].psbt;
          preSignedTxId = repaymentTxs[0].id;  // Track ID for broadcast status update
          console.log(`   Using PSBT from pre_signed_transactions table (record #${preSignedTxId})`);
        }
        
        // The pre-signed PSBT should have borrower's signature
        // We need to add platform + lender signatures
        const result = await addPlatformSignaturesAndBroadcast(
          storage,
          loan,
          psbtBase64,
          EncryptionService,
          preSignedTxId  // Pass ID for broadcast status update
        );
        
        if (result.success) {
          console.log(`✅ [PRE-SIGNED] Transaction broadcast successful: ${result.txid}`);
          return result;
        }
        
        // If pre-signed approach failed, fall through to dynamic creation
        console.log(`⚠️ Pre-signed approach failed: ${result.error}`);
        console.log(`   Falling back to dynamic transaction creation...`);
      } catch (preSignedError: any) {
        console.log(`⚠️ Pre-signed transaction error: ${preSignedError.message}`);
        console.log(`   Falling back to dynamic transaction creation...`);
      }
    } else {
      console.log(`📋 No pre-signed transaction found - using dynamic creation (legacy model)`);
    }
    
    // ================================================================
    // STEP 2: Fallback - Create transaction dynamically (legacy model)
    // ================================================================
    
    // Get escrow details
    const escrowAddress = loan.escrowAddress;
    const witnessScriptHex = loan.escrowWitnessScript;
    const borrowerReturnAddress = borrower.btcAddress;
    
    if (!witnessScriptHex) {
      return { success: false, error: 'No witness script found for escrow' };
    }
    
    // Fetch ALL UTXOs from escrow
    console.log(`📡 Fetching UTXOs from escrow: ${escrowAddress}`);
    const utxos = await fetchUTXOs(escrowAddress);
    
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs found in escrow address' };
    }
    
    // Log all UTXOs and calculate total value
    let totalInputValue = 0;
    for (const utxo of utxos) {
      console.log(`   Found UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
      totalInputValue += utxo.value;
    }
    console.log(`   Total UTXOs: ${utxos.length}, Total value: ${totalInputValue} sats`);
    
    // Get platform's private key
    const platformPrivateKey = BitcoinEscrowService.getPlatformPrivateKey();
    
    // Bitcoin-Blind Lender: Decrypt the lender's private key (platform-controlled)
    let lenderPrivateKey: string | null = null;
    if (loan.lenderPrivateKeyEncrypted) {
      try {
        lenderPrivateKey = EncryptionService.decrypt(loan.lenderPrivateKeyEncrypted);
        console.log(`🔑 Decrypted lender private key for platform-controlled signing`);
      } catch (decryptError: any) {
        console.error(`Failed to decrypt lender private key:`, decryptError.message);
        return { success: false, error: 'Failed to decrypt lender signing key' };
      }
    } else {
      return { success: false, error: 'No encrypted lender key found - cannot sign' };
    }
    
    const witnessScript = Buffer.from(witnessScriptHex, 'hex');
    
    // Calculate fee (1 sat/vB for testnet, ~180 vB per input for 2-of-3 multisig)
    const estimatedVsizePerInput = 180;
    const fee = estimatedVsizePerInput * utxos.length;
    const outputValue = totalInputValue - fee;
    
    if (outputValue <= 0) {
      return { success: false, error: 'Total UTXO value too small to cover fee' };
    }
    
    console.log(`💰 Creating transaction: ${totalInputValue} - ${fee} = ${outputValue} sats`);
    console.log(`   Destination: ${borrowerReturnAddress}`);
    
    // Create PSBT
    const network = getNetwork();
    const psbt = new bitcoin.Psbt({ network });
    
    // Add ALL inputs
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
    
    // Add output to borrower
    psbt.addOutput({
      address: borrowerReturnAddress,
      value: BigInt(outputValue),
    });
    
    // Sign ALL inputs with BOTH platform key AND lender key (2 of 3 signatures)
    console.log(`🔑 Signing ${utxos.length} input(s) with platform key...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, platformPrivateKey, witnessScript);
    }
    
    console.log(`🔑 Signing ${utxos.length} input(s) with lender key (platform-controlled)...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, lenderPrivateKey, witnessScript);
    }
    
    // Now we have 2 of 3 signatures - finalize and broadcast
    try {
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      const txid = tx.getId();
      
      console.log(`✅ [LEGACY] Transaction finalized with platform + lender keys: ${txid}`);
      
      // Broadcast
      const broadcastTxid = await broadcastToTestnet4(txHex);
      
      console.log(`📡 [LEGACY] Transaction broadcast successful: ${broadcastTxid}`);
      
      return {
        success: true,
        txid: broadcastTxid,
        broadcastUrl: getExplorerUrl('tx', broadcastTxid),
      };
    } catch (finalizeError: any) {
      console.error('Failed to finalize transaction:', finalizeError.message);
      
      return {
        success: false,
        error: `Could not finalize transaction: ${finalizeError.message}`,
      };
    }
    
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
  console.log(`🔐 Starting collateral release for loan #${loanId} to ${destinationAddress}`);
  
  try {
    // Dynamic import to avoid circular dependency
    const { storage } = await import('../storage.js');
    const { EncryptionService } = await import('./EncryptionService.js');
    
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (!loan.escrowAddress) {
      return { success: false, error: 'No escrow address found' };
    }
    
    const escrowAddress = loan.escrowAddress;
    const witnessScriptHex = loan.escrowWitnessScript;
    
    if (!witnessScriptHex) {
      return { success: false, error: 'No witness script found for escrow' };
    }
    
    // Bitcoin-Blind Lender Model: Get the encrypted lender private key
    // Platform controls this key on behalf of the lender
    if (!loan.lenderPrivateKeyEncrypted) {
      return { success: false, error: 'No lender private key found - cannot sign for liquidation' };
    }
    
    // Decrypt the lender's private key (using static method)
    console.log(`🔓 Decrypting lender private key for Bitcoin-blind liquidation...`);
    let lenderPrivateKey: string;
    try {
      lenderPrivateKey = EncryptionService.decrypt(loan.lenderPrivateKeyEncrypted);
    } catch (decryptError: any) {
      console.error('Failed to decrypt lender key:', decryptError.message);
      return { success: false, error: 'Failed to decrypt lender signing key' };
    }
    
    // Fetch ALL UTXOs from escrow
    console.log(`📡 Fetching UTXOs from escrow: ${escrowAddress}`);
    const utxos = await fetchUTXOs(escrowAddress);
    
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs found in escrow address' };
    }
    
    // Log all UTXOs and calculate total value
    let totalInputValue = 0;
    for (const utxo of utxos) {
      console.log(`   Found UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
      totalInputValue += utxo.value;
    }
    console.log(`   Total UTXOs: ${utxos.length}, Total value: ${totalInputValue} sats`);
    
    // Get platform keys
    const platformPrivateKey = BitcoinEscrowService.getPlatformPrivateKey();
    
    const witnessScript = Buffer.from(witnessScriptHex, 'hex');
    
    // Calculate fee (1 sat/vB for testnet, ~180 vB per input for 2-of-3 multisig)
    const estimatedVsizePerInput = 180;
    const fee = estimatedVsizePerInput * utxos.length;
    const outputValue = totalInputValue - fee;
    
    if (outputValue <= 0) {
      return { success: false, error: 'Total UTXO value too small to cover fee' };
    }
    
    console.log(`💰 Creating liquidation transaction: ${totalInputValue} - ${fee} = ${outputValue} sats`);
    console.log(`   Destination (lender): ${destinationAddress}`);
    
    // Create PSBT
    const network = getNetwork();
    const psbt = new bitcoin.Psbt({ network });
    
    // Add ALL inputs
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
    
    // Add output to lender (for liquidation)
    psbt.addOutput({
      address: destinationAddress,
      value: BigInt(outputValue),
    });
    
    // Bitcoin-Blind Lender Model: Sign with BOTH platform key AND lender key
    // Platform controls 2 of 3 keys, enabling automatic liquidation
    console.log(`🔑 Signing ${utxos.length} input(s) with PLATFORM key...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, platformPrivateKey, witnessScript);
    }
    
    console.log(`🔑 Signing ${utxos.length} input(s) with LENDER key (platform-controlled)...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, lenderPrivateKey, witnessScript);
    }
    
    // Clear the lender private key from memory immediately after use
    lenderPrivateKey = '';
    
    console.log(`🔑 Platform + Lender signatures applied (2 of 3) - finalizing...`);
    
    try {
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      const txid = tx.getId();
      
      console.log(`✅ Liquidation transaction finalized: ${txid}`);
      
      // Broadcast
      const broadcastTxid = await broadcastToTestnet4(txHex);
      
      console.log(`📡 Liquidation broadcast successful: ${broadcastTxid}`);
      
      return {
        success: true,
        txid: broadcastTxid,
        broadcastUrl: getExplorerUrl('tx', broadcastTxid),
      };
    } catch (finalizeError: any) {
      console.error('Failed to finalize liquidation:', finalizeError.message);
      return {
        success: false,
        error: `Could not finalize liquidation transaction: ${finalizeError.message}`,
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
