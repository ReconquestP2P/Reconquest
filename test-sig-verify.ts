import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';

// Configure the hash for noble/secp256k1 v2
secp256k1.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = require('@noble/hashes/hmac').hmac.create(sha256, key);
  messages.forEach(m => h.update(m));
  return h.digest();
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

const sighash = hexToBytes('acc0a8f9482f6d4e2dea210f968fef4fd44d1a9aa166c6e98702e20b0263d6f3');
const borrowerPriv = sha256(new TextEncoder().encode('reconquest-testnet4-borrower-seed-2024-demo'));
const borrowerPub = secp256k1.getPublicKey(borrowerPriv, true);

console.log('Borrower pubkey:', bytesToHex(borrowerPub));
console.log('Sighash:', bytesToHex(sighash));

async function test() {
  const sig = await secp256k1.signAsync(sighash, borrowerPriv, { lowS: true });
  console.log('Raw sig (should be 64 bytes):', sig.length);
  console.log('Raw sig hex:', bytesToHex(sig));
  
  // Try verification directly with raw bytes
  const isValid = secp256k1.verify(sig, sighash, borrowerPub);
  console.log('Verification result:', isValid);
}

test();
