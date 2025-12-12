/**
 * Deterministic Key Generator for Testnet4 2-of-3 Multisig
 * 
 * IMPORTANT: These are TEST keys only - for Testnet4 demonstration.
 * In production, each party generates their own keys client-side.
 * 
 * Keys are derived deterministically from seed phrases so you can:
 * 1. Recreate the same multisig in Sparrow wallet
 * 2. Verify signatures independently
 * 3. Inspect the escrow address
 */

import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { TESTNET4_CONFIG } from './testnet4-config.js';

// Deterministic seed phrases for reproducible test keys
// TESTNET ONLY - DO NOT USE ON MAINNET
const SEED_PHRASES = {
  borrower: 'reconquest-testnet4-borrower-seed-2024-demo',
  lender: 'reconquest-testnet4-lender-seed-2024-demo',
  platform: 'reconquest-testnet4-platform-seed-2024-demo',
};

export interface DeterministicKeypair {
  role: 'borrower' | 'lender' | 'platform';
  privateKeyHex: string;
  publicKeyHex: string;
  publicKeyCompressed: string;
}

/**
 * Generate a deterministic keypair from a seed phrase
 */
function generateKeypairFromSeed(seed: string): { privateKey: Uint8Array; publicKey: Uint8Array } {
  // Hash the seed to get 32 bytes for private key
  const privateKey = sha256(new TextEncoder().encode(seed));
  
  // Derive compressed public key
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  
  return { privateKey, publicKey };
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate all three deterministic keypairs for the 2-of-3 multisig
 */
export function generateTestnet4Keypairs(): {
  borrower: DeterministicKeypair;
  lender: DeterministicKeypair;
  platform: DeterministicKeypair;
} {
  const borrowerKp = generateKeypairFromSeed(SEED_PHRASES.borrower);
  const lenderKp = generateKeypairFromSeed(SEED_PHRASES.lender);
  const platformKp = generateKeypairFromSeed(SEED_PHRASES.platform);
  
  return {
    borrower: {
      role: 'borrower',
      privateKeyHex: bytesToHex(borrowerKp.privateKey),
      publicKeyHex: bytesToHex(borrowerKp.publicKey),
      publicKeyCompressed: bytesToHex(borrowerKp.publicKey),
    },
    lender: {
      role: 'lender',
      privateKeyHex: bytesToHex(lenderKp.privateKey),
      publicKeyHex: bytesToHex(lenderKp.publicKey),
      publicKeyCompressed: bytesToHex(lenderKp.publicKey),
    },
    platform: {
      role: 'platform',
      privateKeyHex: bytesToHex(platformKp.privateKey),
      publicKeyHex: bytesToHex(platformKp.publicKey),
      publicKeyCompressed: bytesToHex(platformKp.publicKey),
    },
  };
}

/**
 * Get the seed phrases (for Sparrow wallet import)
 */
export function getTestSeedPhrases() {
  return SEED_PHRASES;
}

/**
 * Sort public keys in BIP-67 lexicographic order
 * Required for deterministic multisig script construction
 */
export function sortPublicKeysBIP67(pubkeys: string[]): string[] {
  return [...pubkeys].sort((a, b) => a.localeCompare(b));
}

/**
 * Create a 2-of-3 multisig witness script (for P2WSH)
 * Script: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
 */
export function createMultisigWitnessScript(pubkeys: string[]): Uint8Array {
  // Sort pubkeys per BIP-67
  const sortedPubkeys = sortPublicKeysBIP67(pubkeys);
  
  // Build witness script
  // OP_2 = 0x52
  // OP_3 = 0x53
  // OP_CHECKMULTISIG = 0xae
  const scriptParts: number[] = [];
  
  // OP_2 (require 2 signatures)
  scriptParts.push(0x52);
  
  // Push each pubkey (33 bytes each for compressed)
  for (const pubkeyHex of sortedPubkeys) {
    const pubkeyBytes = hexToBytes(pubkeyHex);
    scriptParts.push(pubkeyBytes.length); // Push length (33 = 0x21)
    scriptParts.push(...pubkeyBytes);
  }
  
  // OP_3 (3 total keys)
  scriptParts.push(0x53);
  
  // OP_CHECKMULTISIG
  scriptParts.push(0xae);
  
  return new Uint8Array(scriptParts);
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Create P2WSH address from witness script
 * P2WSH = OP_0 <32-byte-SHA256(witnessScript)>
 */
export function createP2WSHAddress(witnessScript: Uint8Array): string {
  // SHA256 of witness script
  const scriptHash = sha256(witnessScript);
  
  // Bech32 encode with witness version 0
  return bech32Encode('tb', 0, scriptHash);
}

/**
 * Bech32 encoding for SegWit addresses
 */
function bech32Encode(hrp: string, witnessVersion: number, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  
  // Convert data to 5-bit groups
  const converted = convertBits(Array.from(data), 8, 5, true);
  if (!converted) throw new Error('Failed to convert bits');
  
  // Prepend witness version
  const values = [witnessVersion, ...converted];
  
  // Create checksum
  const checksum = createBech32Checksum(hrp, values);
  
  // Encode
  let result = hrp + '1';
  for (const v of [...values, ...checksum]) {
    result += CHARSET[v];
  }
  
  return result;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  
  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    return null;
  }
  
  return result;
}

function createBech32Checksum(hrp: string, values: number[]): number[] {
  // BECH32 constant = 1 (for witness v0: P2WPKH, P2WSH)
  // BECH32M constant = 0x2bc830a3 (for witness v1+: Taproot)
  const BECH32_CONST = 1;
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ BECH32_CONST;
  const result: number[] = [];
  for (let i = 0; i < 6; i++) {
    result.push((polymod >> (5 * (5 - i))) & 31);
  }
  return result;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 31);
  }
  return result;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

/**
 * Generate complete Testnet4 multisig setup
 */
export function generateTestnet4Multisig(): {
  keypairs: ReturnType<typeof generateTestnet4Keypairs>;
  witnessScript: string;
  witnessScriptHex: string;
  escrowAddress: string;
  sortedPubkeys: string[];
} {
  const keypairs = generateTestnet4Keypairs();
  
  const pubkeys = [
    keypairs.borrower.publicKeyCompressed,
    keypairs.lender.publicKeyCompressed,
    keypairs.platform.publicKeyCompressed,
  ];
  
  const sortedPubkeys = sortPublicKeysBIP67(pubkeys);
  const witnessScript = createMultisigWitnessScript(pubkeys);
  const witnessScriptHex = bytesToHex(witnessScript);
  const escrowAddress = createP2WSHAddress(witnessScript);
  
  return {
    keypairs,
    witnessScript: witnessScriptHex,
    witnessScriptHex,
    escrowAddress,
    sortedPubkeys,
  };
}
