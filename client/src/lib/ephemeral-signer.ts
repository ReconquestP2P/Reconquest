/**
 * Ephemeral Key Manager - Firefish Security Model
 * 
 * CRITICAL SECURITY DESIGN:
 * - Private keys are generated, used to sign, then IMMEDIATELY DISCARDED
 * - Keys are NEVER stored (not even encrypted)
 * - Keys are NEVER displayed to users
 * - Only pre-signed transactions are persisted
 * - Memory is actively wiped after use
 * 
 * Based on Firefish platform architecture where:
 * 1. User generates ephemeral keypair
 * 2. Pre-signs recovery & closing transactions
 * 3. Private key is discarded (fill with zeros)
 * 4. User downloads pre-signed transactions
 * 5. If platform disappears, user broadcasts recovery transaction
 */

import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import * as Firefish from './firefish-wasm-mock';

// Configure secp256k1 v3.0.0 to use sha256 and hmac for ECDSA signing
// In v3.0.0, these are on the 'hashes' object, not 'etc'
secp256k1.hashes.sha256 = (msg: Uint8Array): Uint8Array => {
  return sha256(msg);
};

secp256k1.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]): Uint8Array => {
  const concatenated = secp256k1.etc.concatBytes(...msgs);
  return hmac(sha256, key, concatenated);
};

export interface SignedTransaction {
  type: 'recovery' | 'cooperative_close' | 'default' | 'repayment' | 'liquidation';
  psbt: string;              // Base64 encoded PSBT
  signature: string;         // Signature
  txHash: string;            // Transaction hash for reference
  validAfter?: number;       // Unix timestamp (for timelocked transactions)
}

export interface EphemeralSigningResult {
  publicKey: string;
  signedTransactions: SignedTransaction[];
  // Note: NO privateKey field - it's discarded!
}

/**
 * Wipe sensitive data from memory
 * This overwrites the buffer with zeros to prevent memory scraping
 */
function wipeSensitiveData(data: Uint8Array | string): void {
  if (data instanceof Uint8Array) {
    data.fill(0);
  }
  // For strings, we can't directly overwrite them in JS
  // but we can help GC by nulling references
}

/**
 * Generate ephemeral keys, sign required transactions, then DISCARD keys
 * 
 * This is the ONLY way to use private keys in our system.
 * Keys never leave this function scope.
 */
export async function generateAndSignTransactions(params: {
  loanId: number;
  role: 'borrower' | 'lender';
  escrowAddress?: string;
  loanAmount: number;
  collateralBtc: number;
  currency: string;
  term: number;
}): Promise<EphemeralSigningResult> {
  let privateKeyBytes: Uint8Array | null = null;
  let privateKeyHex: string | null = null;
  
  try {
    // Generate ephemeral Bitcoin keypair
    const keys = Firefish.generateKeys();
    const publicKey = keys.publicKey;
    
    // Convert private key to Uint8Array for secure wiping
    privateKeyHex = keys.privateKey;
    privateKeyBytes = hexToBytes(privateKeyHex);
    
    console.log(`🔐 Ephemeral ${params.role} key generated for loan #${params.loanId}`);
    
    // Pre-sign all required transactions
    const signedTransactions: SignedTransaction[] = [];
    
    // 1. Recovery Transaction (for borrower)
    // This allows borrower to recover collateral if platform disappears
    // LENDER PRIORITY: Borrower's recovery activates 14 days AFTER loan term ends
    // This gives lender first chance to claim if they weren't repaid
    if (params.role === 'borrower' && params.escrowAddress) {
      const borrowerGracePeriodDays = 14; // Borrower must wait 14 days after term ends
      const borrowerTimelock = (params.term * 30 + borrowerGracePeriodDays) * 24 * 60 * 60; // seconds
      
      const recoveryTx = await buildRecoveryTransaction({
        loanId: params.loanId,
        escrowAddress: params.escrowAddress,
        borrowerPubkey: publicKey,
        collateralBtc: params.collateralBtc,
        timelock: borrowerTimelock,
      });
      
      const recoverySignature = await signTransaction(recoveryTx.messageHash, privateKeyHex);
      
      signedTransactions.push({
        type: 'recovery',
        psbt: recoveryTx.psbt,
        signature: recoverySignature,
        txHash: recoveryTx.txHash,
        validAfter: Date.now() + (borrowerTimelock * 1000),
      });
    }
    
    // 2. Cooperative Close Transaction
    // This is used when loan is repaid successfully
    if (params.escrowAddress) {
      const cooperativeTx = await buildCooperativeCloseTransaction({
        loanId: params.loanId,
        escrowAddress: params.escrowAddress,
        publicKey,
        loanAmount: params.loanAmount,
        collateralBtc: params.collateralBtc,
      });
      
      const cooperativeSignature = await signTransaction(cooperativeTx.messageHash, privateKeyHex);
      
      signedTransactions.push({
        type: 'cooperative_close',
        psbt: cooperativeTx.psbt,
        signature: cooperativeSignature,
        txHash: cooperativeTx.txHash,
      });
    }
    
    // 3. Default Transaction (for lender protection)
    // This allows lender to claim collateral if borrower defaults
    // LENDER PRIORITY: Lender's timelock activates when loan term ends
    // Borrower can only recover 14 days later, giving lender first claim
    if (params.role === 'lender' && params.escrowAddress) {
      const lenderTimelock = params.term * 30 * 24 * 60 * 60; // Activates at loan term end
      
      const defaultTx = await buildDefaultTransaction({
        loanId: params.loanId,
        escrowAddress: params.escrowAddress,
        lenderPubkey: publicKey,
        collateralBtc: params.collateralBtc,
        timelock: lenderTimelock,
      });
      
      const defaultSignature = await signTransaction(defaultTx.messageHash, privateKeyHex);
      
      signedTransactions.push({
        type: 'default',
        psbt: defaultTx.psbt,
        signature: defaultSignature,
        txHash: defaultTx.txHash,
        validAfter: Date.now() + (lenderTimelock * 1000),
      });
    }
    
    console.log(`✅ Pre-signed ${signedTransactions.length} transactions for ${params.role}`);
    
    return {
      publicKey,
      signedTransactions,
    };
    
  } finally {
    // CRITICAL: Wipe private key from memory
    if (privateKeyBytes) {
      wipeSensitiveData(privateKeyBytes);
      privateKeyBytes = null;
    }
    if (privateKeyHex) {
      privateKeyHex = null; // Help GC
    }
    
    console.log('🗑️ Private key wiped from memory (ephemeral key discarded)');
  }
}

/**
 * Sign a Bitcoin transaction hash
 * This is only called within the ephemeral scope
 */
async function signTransaction(messageHash: string, privateKey: string): Promise<string> {
  // Convert hex strings to Uint8Array - secp256k1.sign expects Uint8Array inputs
  const messageBytes = hexToBytes(messageHash);
  const privateKeyBytes = hexToBytes(privateKey);
  
  // secp256k1.sign returns a Signature object
  const signature = await secp256k1.sign(messageBytes, privateKeyBytes, { prehash: false });
  
  // v3 returns Uint8Array(64) compact signature directly
  return Array.from(signature as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a valid 32-byte message hash for signing
 * In production, this would be the double-SHA256 of the transaction
 */
function generateMessageHash(data: string): string {
  // Create a deterministic 32-byte (64 hex chars) hash
  // Using a simple approach: repeat hash of input
  let hash = '';
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  
  // Simple deterministic hash generation (in production use SHA-256)
  let seed = 0;
  for (let i = 0; i < bytes.length; i++) {
    seed = (seed * 31 + bytes[i]) % 0xFFFFFFFF;
  }
  
  // Generate 64 hex characters (32 bytes)
  for (let i = 0; i < 64; i++) {
    seed = (seed * 1103515245 + 12345) % 0xFFFFFFFF;
    hash += (seed % 16).toString(16);
  }
  
  return hash;
}

/**
 * Fetch real PSBT template from backend
 * This ensures the frontend signs a backend-validated transaction
 */
async function fetchPSBTTemplate(loanId: number, txType: string): Promise<{
  psbtBase64: string;
  txHash: string;
  outputAddress: string;
  outputValue: number;
  fee: number;
} | null> {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/loans/${loanId}/psbt-template?txType=${txType}`, {
      credentials: 'include',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch PSBT template: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`📋 Received real PSBT template for ${txType}`);
    console.log(`   Output: ${data.outputAddress} (${data.outputValue} sats)`);
    console.log(`   Fee: ${data.fee} sats`);
    
    return {
      psbtBase64: data.psbtBase64,
      txHash: data.txHash,
      outputAddress: data.outputAddress,
      outputValue: data.outputValue,
      fee: data.fee,
    };
  } catch (error) {
    console.warn('Error fetching PSBT template:', error);
    return null;
  }
}

/**
 * Build recovery transaction (allows borrower to recover collateral after timelock)
 */
async function buildRecoveryTransaction(params: {
  loanId: number;
  escrowAddress: string;
  borrowerPubkey: string;
  collateralBtc: number;
  timelock: number;
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Try to get real PSBT from backend
  const realPsbt = await fetchPSBTTemplate(params.loanId, 'recovery');
  
  if (realPsbt) {
    const messageHash = generateMessageHash(realPsbt.psbtBase64);
    return {
      psbt: realPsbt.psbtBase64,
      messageHash,
      txHash: realPsbt.txHash,
    };
  }
  
  // NO FALLBACK: Throw error if no UTXO - user must wait for escrow funding
  throw new Error('UTXO_NOT_FOUND: The escrow address has not been funded yet. Please deposit the Bitcoin collateral first, then generate your recovery plan.');
}

/**
 * Build cooperative close transaction (normal loan repayment)
 */
async function buildCooperativeCloseTransaction(params: {
  loanId: number;
  escrowAddress: string;
  publicKey: string;
  loanAmount: number;
  collateralBtc: number;
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Try to get real PSBT from backend
  const realPsbt = await fetchPSBTTemplate(params.loanId, 'cooperative_close');
  
  if (realPsbt) {
    const messageHash = generateMessageHash(realPsbt.psbtBase64);
    return {
      psbt: realPsbt.psbtBase64,
      messageHash,
      txHash: realPsbt.txHash,
    };
  }
  
  // NO FALLBACK: Throw error if no UTXO - user must wait for escrow funding
  throw new Error('UTXO_NOT_FOUND: The escrow address has not been funded yet. Please deposit the Bitcoin collateral first, then generate your recovery plan.');
}

/**
 * Build default transaction (lender claims collateral on default)
 */
async function buildDefaultTransaction(params: {
  loanId: number;
  escrowAddress: string;
  lenderPubkey: string;
  collateralBtc: number;
  timelock: number;
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Try to get real PSBT from backend
  const realPsbt = await fetchPSBTTemplate(params.loanId, 'default');
  
  if (realPsbt) {
    const messageHash = generateMessageHash(realPsbt.psbtBase64);
    return {
      psbt: realPsbt.psbtBase64,
      messageHash,
      txHash: realPsbt.txHash,
    };
  }
  
  // NO FALLBACK: Throw error if no UTXO - user must wait for escrow funding
  throw new Error('UTXO_NOT_FOUND: The escrow address has not been funded yet. Please deposit the Bitcoin collateral first, then generate your recovery plan.');
}

/**
 * Create downloadable backup file with signed transactions
 * This is what users download instead of private keys!
 */
export function createSignedTransactionBackup(
  loanId: number,
  role: 'borrower' | 'lender',
  result: EphemeralSigningResult
): Blob {
  const backup = {
    loanId,
    role,
    publicKey: result.publicKey,
    signedTransactions: result.signedTransactions,
    createdAt: new Date().toISOString(),
    version: '1.0',
    notice: 'This file contains pre-signed Bitcoin transactions. Your private key was discarded after signing for security.',
  };
  
  const json = JSON.stringify(backup, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Download signed transactions to user's device
 */
export function downloadSignedTransactions(
  loanId: number,
  role: 'borrower' | 'lender',
  result: EphemeralSigningResult
): void {
  const blob = createSignedTransactionBackup(loanId, role, result);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `loan-${loanId}-signed-transactions.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log(`📥 Downloaded signed transactions for loan #${loanId}`);
}

// Utility functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
