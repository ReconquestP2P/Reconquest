/**
 * Deterministic Key Derivation - Firefish Security Model
 * 
 * This module allows users to derive the SAME keypair using:
 * - Loan ID (public, known)
 * - User ID (public, known)
 * - User PIN/passphrase (secret, only known to user)
 * 
 * The same PIN will always generate the same key for a given loan/user.
 * This enables:
 * 1. Generate key for escrow creation
 * 2. Later, re-derive same key for signing
 * 3. Discard key after signing (PIN can regenerate it if needed)
 */

import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';

// Configure secp256k1 hashes
secp256k1.hashes.sha256 = (msg: Uint8Array): Uint8Array => sha256(msg);
secp256k1.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]): Uint8Array => {
  const concatenated = secp256k1.etc.concatBytes(...msgs);
  return hmac(sha256, key, concatenated);
};

export interface DerivedKeyPair {
  privateKey: Uint8Array;
  publicKey: string; // Hex-encoded compressed pubkey
}

/**
 * Derive a deterministic Bitcoin keypair from loan context + user PIN
 * 
 * Uses PBKDF2 with 100,000 iterations for security against brute force.
 * The salt includes loan ID and user ID to ensure unique keys per loan/user.
 */
export function deriveKeyFromPin(
  loanId: number,
  userId: number,
  role: 'borrower' | 'lender',
  pin: string
): DerivedKeyPair {
  // Create a unique salt from loan context
  const salt = `reconquest:${loanId}:${userId}:${role}:escrow-key-v1`;
  const saltBytes = new TextEncoder().encode(salt);
  const pinBytes = new TextEncoder().encode(pin);
  
  // Derive 32 bytes using PBKDF2
  // 100,000 iterations provides good security against brute force
  const privateKey = pbkdf2(sha256, pinBytes, saltBytes, {
    c: 100000, // iterations
    dkLen: 32, // 32 bytes for secp256k1 private key
  });
  
  // Derive compressed public key
  const publicKeyBytes = secp256k1.getPublicKey(privateKey, true);
  const publicKey = bytesToHex(publicKeyBytes);
  
  return { privateKey, publicKey };
}

/**
 * Verify that a PIN produces the expected public key
 * Used to confirm user entered the correct PIN before signing
 */
export function verifyPinProducesKey(
  loanId: number,
  userId: number,
  role: 'borrower' | 'lender',
  pin: string,
  expectedPublicKey: string
): boolean {
  const derived = deriveKeyFromPin(loanId, userId, role, pin);
  // Clean up private key immediately
  derived.privateKey.fill(0);
  return derived.publicKey.toLowerCase() === expectedPublicKey.toLowerCase();
}

/**
 * Sign a message hash with a derived key, then wipe the key
 */
export async function signWithDerivedKey(
  loanId: number,
  userId: number,
  role: 'borrower' | 'lender',
  pin: string,
  messageHash: Uint8Array
): Promise<string> {
  const { privateKey } = deriveKeyFromPin(loanId, userId, role, pin);
  
  try {
    const signature = await secp256k1.sign(messageHash, privateKey);
    // @ts-ignore - toCompactHex exists at runtime
    return signature.toCompactHex ? signature.toCompactHex() : bytesToHex(signature.toCompactRawBytes());
  } finally {
    // CRITICAL: Wipe private key
    privateKey.fill(0);
  }
}

/**
 * Generate a public key from PIN without keeping the private key in memory longer than needed
 */
export function generatePublicKeyFromPin(
  loanId: number,
  userId: number,
  role: 'borrower' | 'lender',
  pin: string
): string {
  const { privateKey, publicKey } = deriveKeyFromPin(loanId, userId, role, pin);
  // Immediately wipe private key - we only need the public key
  privateKey.fill(0);
  return publicKey;
}

// Utility functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
