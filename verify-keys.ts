import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';

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

// Generate keypairs the same way as the E2E script
const seeds = {
  borrower: 'reconquest-testnet4-borrower-seed-2024-demo',
  platform: 'reconquest-testnet4-platform-seed-2024-demo',
};

console.log('=== KEYPAIR VERIFICATION ===\n');

for (const [role, seed] of Object.entries(seeds)) {
  const privateKey = sha256(new TextEncoder().encode(seed));
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  
  console.log(`${role.toUpperCase()}:`);
  console.log('  Private key:', bytesToHex(privateKey));
  console.log('  Public key:', bytesToHex(publicKey));
}

// Now test signing
const sighash = hexToBytes('acc0a8f9482f6d4e2dea210f968fef4fd44d1a9aa166c6e98702e20b0263d6f3');
console.log('\n=== SIGNATURE VERIFICATION ===');
console.log('Sighash:', bytesToHex(sighash));

async function testSigs() {
  // Expected pubkeys from the witness script (BIP-67 sorted)
  const expectedPubkeys = [
    '02394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a', // Index 0
    '03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e', // Index 1
    '03ea7e493ac2f8fb9d1a24f860bb0d6f92b98be4ec667ddac179283a555dd5fbeb', // Index 2
  ];
  
  for (const [role, seed] of Object.entries(seeds)) {
    const privateKey = sha256(new TextEncoder().encode(seed));
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const pubkeyHex = bytesToHex(publicKey);
    
    // Find index in sorted pubkeys
    const index = expectedPubkeys.indexOf(pubkeyHex);
    console.log(`\n${role}: index=${index}, pubkey=${pubkeyHex.slice(0, 20)}...`);
    
    if (index === -1) {
      console.log('  ERROR: Public key not found in witness script!');
      continue;
    }
    
    // Sign
    const sig = await secp256k1.signAsync(sighash, privateKey, { lowS: true });
    console.log('  Signature (compact):', bytesToHex(sig).slice(0, 40) + '...');
    
    // Verify
    const isValid = secp256k1.verify(sig, sighash, publicKey);
    console.log('  Signature valid?', isValid);
  }
}

testSigs();
