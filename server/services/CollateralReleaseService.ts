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
import type { IStorage } from '../storage.js';

bitcoin.initEccLib(ecc);

const TESTNET4_NETWORK = bitcoin.networks.testnet;

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
      `https://mempool.space/testnet4/api/address/${address}/utxo`,
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
    const psbt = new bitcoin.Psbt({ network: TESTNET4_NETWORK });
    
    // Add ALL inputs
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wsh({
            redeem: { output: witnessScript, network: TESTNET4_NETWORK },
            network: TESTNET4_NETWORK,
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
      
      console.log(`✅ Transaction finalized with platform + lender keys: ${txid}`);
      
      // Broadcast
      const broadcastTxid = await broadcastToTestnet4(txHex);
      
      console.log(`📡 Transaction broadcast successful: ${broadcastTxid}`);
      
      return {
        success: true,
        txid: broadcastTxid,
        broadcastUrl: `https://mempool.space/testnet4/tx/${broadcastTxid}`,
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
    const psbt = new bitcoin.Psbt({ network: TESTNET4_NETWORK });
    
    // Add ALL inputs
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wsh({
            redeem: { output: witnessScript, network: TESTNET4_NETWORK },
            network: TESTNET4_NETWORK,
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
        broadcastUrl: `https://mempool.space/testnet4/tx/${broadcastTxid}`,
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
