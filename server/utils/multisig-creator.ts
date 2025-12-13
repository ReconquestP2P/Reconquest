import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Multisig Creator - Server-side utility for creating 2-of-3 multisig Bitcoin addresses
 * This generates VALID P2WSH testnet addresses with proper bech32 encoding
 */

export interface MultisigAddress {
  address: string;
  witnessScript: string;
  scriptHash: string;
}

/**
 * Validate a Bitcoin public key (compressed secp256k1)
 * Uses cryptographic verification to ensure the key is a valid curve point
 * @param pubkey - The public key hex string
 * @param label - Label for error messages
 */
async function validatePublicKey(pubkey: string, label: string): Promise<void> {
  if (!pubkey || pubkey.length !== 66) {
    throw new Error(`${label} public key must be exactly 66 characters (33 bytes compressed)`);
  }
  
  if (!/^[0-9a-fA-F]{66}$/.test(pubkey)) {
    throw new Error(`${label} public key must be valid hexadecimal`);
  }
  
  const prefix = pubkey.substring(0, 2);
  if (prefix !== '02' && prefix !== '03') {
    throw new Error(`${label} public key must start with 02 or 03 (compressed format)`);
  }
  
  try {
    const point = secp256k1.Point.fromHex(pubkey);
    if (!point) {
      throw new Error(`${label} public key is not a valid secp256k1 point`);
    }
  } catch (error) {
    throw new Error(`${label} public key failed cryptographic validation: ${error instanceof Error ? error.message : 'invalid curve point'}`);
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sort public keys in BIP-67 lexicographic order
 */
function sortPublicKeysBIP67(pubkeys: string[]): string[] {
  return [...pubkeys].sort((a, b) => a.localeCompare(b));
}

/**
 * Create a 2-of-3 multisig witness script
 * Script: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
 */
function createWitnessScript(pubkeys: string[]): Uint8Array {
  const sortedPubkeys = sortPublicKeysBIP67(pubkeys);
  const scriptParts: number[] = [];
  
  scriptParts.push(0x52); // OP_2
  
  for (const pubkeyHex of sortedPubkeys) {
    const pubkeyBytes = hexToBytes(pubkeyHex);
    scriptParts.push(pubkeyBytes.length); // Push length (33 = 0x21)
    scriptParts.push(...pubkeyBytes);
  }
  
  scriptParts.push(0x53); // OP_3
  scriptParts.push(0xae); // OP_CHECKMULTISIG
  
  return new Uint8Array(scriptParts);
}

/**
 * Convert 8-bit data to 5-bit groups for bech32 encoding
 */
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

/**
 * Expand HRP (human readable part) for checksum calculation
 */
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

/**
 * Calculate bech32 polymod
 */
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
 * Create bech32 checksum for witness version 0 (P2WPKH, P2WSH)
 */
function createBech32Checksum(hrp: string, values: number[]): number[] {
  const BECH32_CONST = 1; // For witness v0
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ BECH32_CONST;
  const result: number[] = [];
  for (let i = 0; i < 6; i++) {
    result.push((polymod >> (5 * (5 - i))) & 31);
  }
  return result;
}

/**
 * Encode data as bech32 address
 */
function bech32Encode(hrp: string, witnessVersion: number, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  
  const converted = convertBits(Array.from(data), 8, 5, true);
  if (!converted) throw new Error('Failed to convert bits');
  
  const values = [witnessVersion, ...converted];
  const checksum = createBech32Checksum(hrp, values);
  
  let result = hrp + '1';
  for (const v of [...values, ...checksum]) {
    result += CHARSET[v];
  }
  
  return result;
}

/**
 * Create P2WSH address from witness script
 * P2WSH = bech32(OP_0 || SHA256(witnessScript))
 */
function createP2WSHAddress(witnessScript: Uint8Array): string {
  const scriptHash = sha256(witnessScript);
  return bech32Encode('tb', 0, scriptHash);
}

/**
 * Create a 2-of-3 multisig Bitcoin testnet address
 * Generates a VALID P2WSH bech32 address that works on testnet/testnet4
 */
export async function createMultisigAddress(
  borrowerPubkey: string,
  lenderPubkey: string,
  platformPubkey: string
): Promise<MultisigAddress> {
  await validatePublicKey(borrowerPubkey, 'Borrower');
  await validatePublicKey(lenderPubkey, 'Lender');
  await validatePublicKey(platformPubkey, 'Platform');

  const pubkeys = [borrowerPubkey, lenderPubkey, platformPubkey];
  const witnessScript = createWitnessScript(pubkeys);
  const witnessScriptHex = bytesToHex(witnessScript);
  const scriptHash = sha256(witnessScript);
  const scriptHashHex = bytesToHex(scriptHash);
  const address = createP2WSHAddress(witnessScript);

  console.log(`✅ Created 2-of-3 multisig address: ${address}`);
  console.log(`   Borrower: ${borrowerPubkey.substring(0, 20)}...`);
  console.log(`   Lender: ${lenderPubkey.substring(0, 20)}...`);
  console.log(`   Platform: ${platformPubkey.substring(0, 20)}...`);

  return {
    address,
    witnessScript: witnessScriptHex,
    scriptHash: scriptHashHex,
  };
}
