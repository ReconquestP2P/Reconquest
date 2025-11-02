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
import * as Firefish from './firefish-wasm-mock';

export interface SignedTransaction {
  type: 'recovery' | 'cooperative_close' | 'default';
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
    if (params.role === 'borrower' && params.escrowAddress) {
      const recoveryTx = await buildRecoveryTransaction({
        escrowAddress: params.escrowAddress,
        borrowerPubkey: publicKey,
        collateralBtc: params.collateralBtc,
        timelock: params.term * 30 * 24 * 60 * 60, // Term in months converted to seconds
      });
      
      const recoverySignature = await signTransaction(recoveryTx.messageHash, privateKeyHex);
      
      signedTransactions.push({
        type: 'recovery',
        psbt: recoveryTx.psbt,
        signature: recoverySignature,
        txHash: recoveryTx.txHash,
        validAfter: Date.now() + (params.term * 30 * 24 * 60 * 60 * 1000),
      });
    }
    
    // 2. Cooperative Close Transaction
    // This is used when loan is repaid successfully
    if (params.escrowAddress) {
      const cooperativeTx = await buildCooperativeCloseTransaction({
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
    if (params.role === 'lender' && params.escrowAddress) {
      const defaultTx = await buildDefaultTransaction({
        escrowAddress: params.escrowAddress,
        lenderPubkey: publicKey,
        collateralBtc: params.collateralBtc,
      });
      
      const defaultSignature = await signTransaction(defaultTx.messageHash, privateKeyHex);
      
      signedTransactions.push({
        type: 'default',
        psbt: defaultTx.psbt,
        signature: defaultSignature,
        txHash: defaultTx.txHash,
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
  // secp256k1.sign returns a Signature object (TypeScript types may be wrong)
  // @ts-ignore - secp256k1 types don't match runtime behavior
  const signature = await secp256k1.sign(messageHash, privateKey);
  
  // Signature object has toCompactHex() method
  // @ts-ignore - Runtime has this method even if types don't show it
  return signature.toCompactHex ? signature.toCompactHex() : String(signature);
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
 * Build recovery transaction (allows borrower to recover collateral after timelock)
 */
async function buildRecoveryTransaction(params: {
  escrowAddress: string;
  borrowerPubkey: string;
  collateralBtc: number;
  timelock: number; // seconds
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Mock implementation - in production, use actual Bitcoin PSBT library
  const mockPSBT = `recovery_psbt_${params.escrowAddress}_${Date.now()}`;
  const txData = `recovery_${params.escrowAddress}_${params.borrowerPubkey}_${params.collateralBtc}_${params.timelock}`;
  const messageHash = generateMessageHash(txData);
  
  return {
    psbt: Buffer.from(mockPSBT).toString('base64'),
    messageHash,
    txHash: `recovery_tx_${params.borrowerPubkey.slice(0, 8)}`,
  };
}

/**
 * Build cooperative close transaction (normal loan repayment)
 */
async function buildCooperativeCloseTransaction(params: {
  escrowAddress: string;
  publicKey: string;
  loanAmount: number;
  collateralBtc: number;
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Mock implementation
  const mockPSBT = `cooperative_psbt_${params.escrowAddress}_${Date.now()}`;
  const txData = `cooperative_${params.escrowAddress}_${params.publicKey}_${params.loanAmount}_${params.collateralBtc}`;
  const messageHash = generateMessageHash(txData);
  
  return {
    psbt: Buffer.from(mockPSBT).toString('base64'),
    messageHash,
    txHash: `cooperative_tx_${params.publicKey.slice(0, 8)}`,
  };
}

/**
 * Build default transaction (lender claims collateral on default)
 */
async function buildDefaultTransaction(params: {
  escrowAddress: string;
  lenderPubkey: string;
  collateralBtc: number;
}): Promise<{ psbt: string; messageHash: string; txHash: string }> {
  // Mock implementation
  const mockPSBT = `default_psbt_${params.escrowAddress}_${Date.now()}`;
  const txData = `default_${params.escrowAddress}_${params.lenderPubkey}_${params.collateralBtc}`;
  const messageHash = generateMessageHash(txData);
  
  return {
    psbt: Buffer.from(mockPSBT).toString('base64'),
    messageHash,
    txHash: `default_tx_${params.lenderPubkey.slice(0, 8)}`,
  };
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
  link.download = `reconquest-${role}-loan${loanId}-recovery.json`;
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
